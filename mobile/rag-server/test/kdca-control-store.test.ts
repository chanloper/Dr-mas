import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyState, hash, splitDocument, type MedicalDocument } from '../src/model.js';
import { reviewFixture, fixture } from './helpers.js';
import { kdcaCatalog, kdcaLimits } from '../src/kdca-catalog.js';
import { LocalRepository } from '../src/repository.js';
import { restoreCorpus } from '../src/restore-corpus.js';
import { withSupabaseKdcaControls, stopSupabaseKdca } from '../src/kdca-control-store.js';
import { SearchIndex } from '../src/search.js';

async function setup(run: (ctx: { dir: string; env: Record<string,string>; row: Record<string,unknown> }) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'kdca-durable-'));
  try {
    const now = new Date().toISOString(), content = '합성 두통 원문이며 실제 의료자료가 아닙니다.';
    const input = reviewFixture({ id: 'kdca-5830', title: '두통', publisher: '질병관리청 국가건강정보포털',
      sourceUrl: kdcaCatalog[0]!.sourceUrl, content, category: 'disease' as const, publishedAt: null, updatedAt: null,
      collectedAt: now, rights: { permission: 'permitted' as const, terms: 'SYNTHETIC TEST ONLY', checkedAt: now } });
    const doc: MedicalDocument = { ...input, version: 1, contentHash: hash(content), rights: { ...input.rights,
      kdcaUse: { contentId: '5830', contentHash: hash(content), evidenceUrl: 'https://example.org/synthetic-license',
        reviewer: 'synthetic-author', reviewedAt: now, lastVerifiedAt: now, status: 'active',
        approvalConfirmed: true, purposeConfirmed: true, individualTermsConfirmed: true, linkNotificationConfirmed: true,
        storageConfirmed: true, indexingConfirmed: true, quotationConfirmed: true, originalUnchangedConfirmed: true,
        homeDisplayConfirmed: false, ranges: [{ intent: 'overview', start: 0, end: content.length }] } } };
    const state = emptyState(); state.documents[doc.id] = doc;
    const medicine = { ...fixture('medicine'), version: 1 }; medicine.rights.permission = 'permitted';
    state.documents[medicine.id] = { ...medicine, contentHash: hash(medicine.content) };
    for (const d of Object.values(state.documents)) for (const c of splitDocument(d)) state.chunks[c.id] = c;
    state.kdcaLifecycle = { [doc.id]: { status: 'active', reviewer: 'synthetic-author', changedAt: now,
      rawHash: hash('synthetic XML bytes'), contentHash: doc.contentHash, lastVerifiedAt: now } };
    const bytes = JSON.stringify(state), file = join(dir, 'snapshot.json'); await writeFile(file, bytes);
    const env = { RAG_STATE_SECRET_FILE: file, RAG_STATE_SHA256: hash(bytes), RAG_KDCA_CONTROL_BACKEND: 'supabase',
      SUPABASE_URL: 'https://example.supabase.co', RAG_KDCA_CONTROL_SERVICE_KEY: 'MOCK_ONLY_NOT_A_KEY' };
    const row = { content_id: '5830', status: 'active', raw_hash: state.kdcaLifecycle[doc.id]!.rawHash,
      content_hash: doc.contentHash, snapshot_sha256: env.RAG_STATE_SHA256, document_version: 1,
      verified_at: now, operator: 'synthetic-operator', updated_at: now, revision: 1 };
    await run({ dir, env, row });
  } finally { await rm(dir, { recursive: true, force: true }); }
}
test('fresh/free-disk restore and restart use matching durable metadata; no clinical text is sent', async () => setup(async ({dir,env,row}) => {
  let reads = 0;
  const transport: typeof fetch = async (url, init) => {
    reads++; assert.equal(new URL(String(url)).pathname, '/rest/v1/rag_kdca_controls');
    assert.equal(init?.redirect, 'error'); assert.equal(init?.body, undefined);
    assert.equal(String(url).includes('합성'), false);
    return new Response(JSON.stringify([row]));
  };
  for (const boot of ['first','restart-new-disk']) {
    const repo = new LocalRepository(join(dir,boot));
    await restoreCorpus(repo,env,transport);
    const serving = withSupabaseKdcaControls(repo,env,transport);
    assert.equal(new SearchIndex(await serving.read()).search('두통').status,'ok');
    row.status = 'revoked';
    assert.equal(new SearchIndex(await serving.read()).search('두통').status,'insufficient_evidence');
    row.status = 'active';
  }
  assert.equal(reads,6);
}));
test('missing, failed, stale, changed/revoked and mismatched controls never fall back to snapshot active', async () => setup(async ({dir,env,row}) => {
  const cases = [[], [{...row,status:'revoked'}], [{...row,status:'changed_pending_review'}],
    [{...row,verified_at:new Date(Date.now()-kdcaLimits.refreshIntervalMs-1).toISOString()}],
    [{...row,verified_at:new Date(Date.now()+60000).toISOString()}],
    [{...row,snapshot_sha256:'0'.repeat(64)}], [{...row,raw_hash:'0'.repeat(64)}],
    [{...row,content_hash:'0'.repeat(64)}], [{...row,document_version:2}], 'unavailable'];
  for (const [i, value] of cases.entries()) {
    const transport: typeof fetch = async () => { if(value==='unavailable')throw Error('DO_NOT_LOG'); return new Response(JSON.stringify(value)); };
    const repo = new LocalRepository(join(dir,'denied-'+i)); await restoreCorpus(repo,env,transport);
    const state = await withSupabaseKdcaControls(repo,env,transport).read();
    assert.equal(new SearchIndex(state).search('두통').status,'insufficient_evidence');
    assert.equal(state.documents.medicine?.rights.permission,'permitted');
  }
}));
test('a per-request query failure stops an already-restored active document', async () => setup(async ({dir,env,row}) => {
  const repo=new LocalRepository(join(dir,'running'));
  await restoreCorpus(repo,env,async()=>new Response(JSON.stringify([row])));
  const failed=withSupabaseKdcaControls(repo,env,async()=>{throw Error('PRIVATE_UPSTREAM_DETAIL');});
  assert.equal(new SearchIndex(await failed.read()).search('두통').status,'insufficient_evidence');
  assert.equal(new SearchIndex(await repo.read()).search('두통').status,'ok','no cached permission mutation');
}));
test('operator durable stop uses a revision compare-and-set, and conflicts never report success', async () => setup(async ({env,row}) => {
  const transport:typeof fetch=async(url,init)=>{
    if(init?.method!=='PATCH')return new Response(JSON.stringify([row]));
    assert.equal(new URL(String(url)).searchParams.get('revision'),'eq.1');
    const body=JSON.parse(String(init.body));
    assert.deepEqual(Object.keys(body).sort(),['operator','revision','status','updated_at']);
    return new Response(JSON.stringify([{...row,...body}]));
  };
  assert.equal((await stopSupabaseKdca('5830','revoked','synthetic-operator',env,transport)).persisted,true);
  await assert.rejects(stopSupabaseKdca('5830','revoked','synthetic-operator',env,async(_url,init)=>new Response(JSON.stringify(init?.method==='PATCH'?[]:[row]))),/KDCA_DURABLE_STOP_FAILED/);
}));
