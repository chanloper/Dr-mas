import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KdcaPrivateSources, readKdcaPrivateSources } from '../src/kdca-private-sources.js';
import { LocalRepository } from '../src/repository.js';
import { localChat } from '../src/http-api.js';
import { fetchKdca } from '../src/kdca-healthinfo.js';
import { kdcaCatalog } from '../src/kdca-catalog.js';
const endpoint = 'http://api.kdca.go.kr/api/provide/healthInfo';
const token = 'MOCK_ONLY+/=%25';
const row = (id = '5830') => ({ contentId: id, issuedUrl: `${endpoint}?TOKEN=${encodeURIComponent(token)}&cntntsSn=${id}` });
const vault = () => new KdcaPrivateSources({ schema: 1, items: [row()] });
const xml = '<HEAD><CODE>S001</CODE><MESSAGE>OK</MESSAGE></HEAD><svc><CNTNTSSJ>두통</CNTNTSSJ><CNTNTS_SN>5830</CNTNTS_SN><LCLASSN>1</LCLASSN><cntntsClList><cntntsCl><CNTNTS_CL_NM>합성 개요</CNTNTS_CL_NM><CNTNTSCLSN>101</CNTNTSCLSN><CNTNTS_CL_CN><![CDATA[두통 반입 경로 검증용 합성 자료입니다.]]></CNTNTS_CL_CN></cntntsCl></cntntsClList></svc>';

test('660 private URLs do not grant new approvals; serialization reveals counts only', () => {
  const sources = new KdcaPrivateSources({ schema: 1, items: [row(), ...Array.from({ length: 659 }, (_, i) => row(String(10000 + i)))] });
  assert.equal(sources.describe().count, 660);
  assert.equal(sources.describe().supportedCount, 1);
  assert.equal(JSON.stringify(sources).includes(token), false);
  assert.equal(JSON.stringify(sources).includes('TOKEN='), false);
  // Once-decoded original and once-encoded values are both recognized as secrets.
  assert.throws(() => sources.assertXmlHasNoCredentials(token), /KDCA_SECRET_IN_RESPONSE/);
  assert.throws(() => sources.assertXmlHasNoCredentials(encodeURIComponent(token)), /KDCA_SECRET_IN_RESPONSE/);
});

test('strict official endpoint, unique IDs, required TOKEN and one percent decode', async () => {
  for (const url of [row().issuedUrl.replace('http:', 'https:'), row().issuedUrl.replace('api.kdca.go.kr', 'api.kdca.go.kr:80'),
    row().issuedUrl + '&extra=1', row().issuedUrl + '#fragment', row().issuedUrl.replace('cntntsSn=5830', 'cntntsSn=5831'),
    endpoint + '?cntntsSn=5830', endpoint + '?TOKEN=%ZZ&cntntsSn=5830']) {
    assert.throws(() => new KdcaPrivateSources({ schema: 1, items: [{ contentId: '5830', issuedUrl: url }] }), /^Error: KDCA_PRIVATE_LIST_INVALID$/);
  }
  assert.throws(() => new KdcaPrivateSources({ schema: 1, items: [row(), row()] }), /KDCA_PRIVATE_LIST_INVALID/);
  const plus = new KdcaPrivateSources({ schema: 1, items: [{ contentId: '5830', issuedUrl: endpoint + '?TOKEN=MOCK+PLUS&cntntsSn=5830' }] });
  assert.throws(() => plus.assertXmlHasNoCredentials('MOCK+PLUS'), /KDCA_SECRET_IN_RESPONSE/);
  let mockCalls = 0;
  await fetchKdca({ ...kdcaCatalog[0]!, tokenBinding: 'per-content' }, encodeURIComponent(token), {
    tokenEncoding: 'url-component', transport: async (value, options) => {
      mockCalls++;
      const url = new URL(String(value));
      assert.equal(url.origin + url.pathname, endpoint);
      assert.equal(url.searchParams.get('TOKEN'), token);
      assert.equal(url.searchParams.get('cntntsSn'), '5830');
      assert.equal(options?.redirect, 'error');
      return new Response(xml);
    },
  });
  assert.equal(mockCalls, 1);
});

test('live disabled regardless of credentials or flag; no transport exists in this path', async () => {
  await assert.rejects(vault().collect('5830', {}), /KDCA_LIVE_DISABLED/);
  await assert.rejects(vault().collect('5830', { KDCA_LIVE_FETCH_ENABLED: 'true' }), /KDCA_SECURE_CONTRACT_UNCONFIRMED/);
});

test('bounded private file -> unchanged XML quarantine -> pending, no production search', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'kdca-private-test-'));
  try {
    const privateFile = join(parent, 'kdca-issued-urls.json');
    await writeFile(privateFile, JSON.stringify({ schema: 1, items: [row()] }), { mode: 0o600 });
    const sources = await readKdcaPrivateSources({ KDCA_ISSUED_URLS_FILE: privateFile });
    const file = join(parent, 'synthetic.xml'); await writeFile(file, xml);
    const result = await sources.stageXml(file, parent, '5830', { synthetic: true });
    assert.equal(result.networkRequests, 0); assert.equal(result.searchEnabled, false);
    const intake = JSON.parse(await readFile(join(result.directory, 'intake.json'), 'utf8'));
    const checkpoint = JSON.parse(await readFile(join(result.directory, 'checkpoint.json'), 'utf8'));
    assert.equal(checkpoint.items['5830'].attempts, 1);
    assert.equal(checkpoint.items['5830'].status, 'done');
    assert.equal(intake.material, 'synthetic');
    assert.equal(await readFile(join(result.directory, 'raw', intake.rawHash + '.xml'), 'utf8'), xml);
    const repo = new LocalRepository(join(result.directory, 'candidates'));
    assert.equal((await repo.read()).documents['kdca-5830']!.rights.permission, 'pending');
    assert.equal((await localChat(repo, '두통')).status, 'insufficient_evidence');
    await assert.rejects(sources.stageXml(file, parent, '10000'), /KDCA_NOT_APPROVED_OR_NOT_CONFIGURED/);
    await writeFile(file, xml.replace('합성 자료', token + ' 합성 자료'));
    await assert.rejects(sources.stageXml(file, parent, '5830'), /KDCA_SECRET_IN_RESPONSE/);
    await writeFile(file, xml.replace('5830', '5831'));
    await assert.rejects(sources.stageXml(file, parent, '5830'), /KDCA_INVALID_RESPONSE/);
    await writeFile(file, '<!DOCTYPE svc [<!ENTITY x SYSTEM "file:///never-read">]>' + xml);
    await assert.rejects(sources.stageXml(file, parent, '5830'), /KDCA_INVALID_XML/);
  } finally { await rm(parent, { recursive: true, force: true }); }
});
