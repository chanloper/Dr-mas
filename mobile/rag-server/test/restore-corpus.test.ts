import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { restoreCorpus } from '../src/restore-corpus.js';
import { LocalRepository, register } from '../src/repository.js';
import { emptyState, hash, type State } from '../src/model.js';
import { localChat } from '../src/http-api.js';
import { fixture } from './helpers.js';
import { previewRegistration, executeRegistration } from '../src/registration.js';

async function isolated(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'drmas-restore-'));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
async function snapshot(dir: string, state: State) {
  const bytes = Buffer.from(JSON.stringify(state));
  const file = join(dir, 'reviewed-state.json'); await writeFile(file, bytes);
  return { RAG_STATE_SECRET_FILE: file, RAG_STATE_SHA256: createHash('sha256').update(bytes).digest('hex') };
}

test('approved-only restore, pending/test-only excluded; fresh ephemeral directory recovers citations', async () => isolated(async dir => {
  const source = new LocalRepository(join(dir, 'source'));
  const approved = fixture('approved'); approved.rights.permission = 'permitted';
  const pending = fixture('pending'); pending.rights.permission = 'pending';
  await register(source, approved); await register(source, pending); await register(source, fixture('testonly'));
  const env = await snapshot(dir, await source.read());
  for (const name of ['first-boot', 'after-restart']) {
    const target = new LocalRepository(join(dir, name));
    assert.deepEqual(await restoreCorpus(target, env), { status: 'RAG_RESTORE_OK', documents: 1 });
    assert.deepEqual(Object.keys((await target.read()).documents), ['approved']);
    const reply = await localChat(target, '테스트성분알파');
    assert.equal(reply.status, 'local_evidence'); assert.equal(reply.sources.length, 1);
    assert.equal(reply.sources[0]!.documentId, 'approved');
    assert.ok(approved.content.includes(reply.sources[0]!.quote));
    assert.equal(reply.sources[0]!.sourceUrl, approved.sourceUrl);
  }
  // A legacy pending record with permitted scopes is not production evidence.
  const onlyPending = new LocalRepository(join(dir, 'pending-only')); await register(onlyPending, pending);
  assert.equal((await localChat(onlyPending, '테스트성분알파')).status, 'insufficient_evidence');
}));

test('bad checksum or internally corrupted document/chunk never changes destination', async () => isolated(async dir => {
  const target = new LocalRepository(join(dir, 'destination'));
  const doc = fixture('approved'); doc.rights.permission = 'permitted'; await register(target, doc);
  const original = await target.read(), before = await readFile(join(target.directory, 'state.json'), 'utf8');
  const env = await snapshot(dir, original);
  await assert.rejects(restoreCorpus(target, { ...env, RAG_STATE_SHA256: '0'.repeat(64) }), /^Error: RAG_RESTORE_INVALID$/);
  for (const kind of ['document', 'chunk']) {
    const broken = structuredClone(original);
    if (kind === 'document') broken.documents.approved!.content += 'CORRUPTED';
    else Object.values(broken.chunks)[0]!.text += 'CORRUPTED';
    await assert.rejects(restoreCorpus(target, await snapshot(dir, broken)), /^Error: RAG_RESTORE_INVALID$/);
    assert.equal(await readFile(join(target.directory, 'state.json'), 'utf8'), before);
  }
}));

test('no configured data and zero approved snapshot preserve insufficient-evidence behavior', async () => isolated(async dir => {
  const target = new LocalRepository(join(dir, 'target'));
  assert.deepEqual(await restoreCorpus(target, {}), { status: 'RAG_RESTORE_NOT_CONFIGURED', documents: 0 });
  assert.equal((await localChat(target, '두통')).status, 'insufficient_evidence');
  assert.deepEqual(await restoreCorpus(target, await snapshot(dir, emptyState())), { status: 'RAG_RESTORE_OK', documents: 0 });
  assert.equal((await localChat(target, '두통')).status, 'insufficient_evidence');
}));

test('existing explicit approval procedure aligns top-level permission without granting external AI', async () => isolated(async dir => {
  const source = new LocalRepository(join(dir, 'source')), target = new LocalRepository(join(dir, 'target'));
  const doc = fixture('reviewed'); doc.rights.permission = 'pending'; delete doc.rights.scopes;
  doc.attribution = { datasetName: 'Synthetic test dataset', datasetUrl: 'https://example.org/dataset', itemCode: 'test', termsLabel: 'Synthetic test only', termsUrl: 'https://example.org/license' };
  await register(source, doc);
  const plan = await previewRegistration(source, target, { documentId: doc.id, version: 1, contentHash: hash(doc.content) });
  await executeRegistration(source, target, plan, { confirmed: true, reviewer: 'synthetic-test-author', reviewedAt: new Date().toISOString() });
  const created = (await target.read()).documents.reviewed!;
  assert.equal(created.rights.permission, 'permitted');
  assert.equal(created.rights.scopes!.external_generation!.decision, 'denied');
  assert.equal(created.rights.scopes!.external_embedding!.decision, 'denied');
}));
