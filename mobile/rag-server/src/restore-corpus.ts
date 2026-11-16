import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { emptyState, hash, validateDocument, type State } from './model.js';
import { hasPermission, hasChunkPermission } from './rights.js';
import { isKdcaDocument, kdcaUseAllowed } from './kdca-use.js';
import type { LocalRepository } from './repository.js';
import { applyKdcaLifecycle, validateKdcaLifecycle } from './kdca-lifecycle.js';
import { applySupabaseKdcaControls } from './kdca-control-store.js';

const maxBytes = 1_000_000;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

// A Secret File is a delivery mechanism, never evidence of permission.
// Verify the entire snapshot before opening a destination transaction.
export async function restoreCorpus(repo: LocalRepository, env: Record<string, string | undefined>, controlTransport: typeof fetch = fetch) {
  const file = env.RAG_STATE_SECRET_FILE;
  if (!file && !env.RAG_STATE_SHA256) return { status: 'RAG_RESTORE_NOT_CONFIGURED', documents: 0 };
  if (!file || !/^[a-f0-9]{64}$/.test(env.RAG_STATE_SHA256 ?? '')) throw Error('RAG_RESTORE_CONFIG_INVALID');
  const durable = env.RAG_KDCA_CONTROL_BACKEND === 'supabase';
  let restored: State;
  try {
    const handle = await open(file, 'r');
    let bytes: Buffer;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > maxBytes) throw Error();
      const buffer = Buffer.alloc(maxBytes + 1);
      let size = 0;
      while (size < buffer.length) {
        const part = await handle.read(buffer, size, buffer.length - size, null);
        if (!part.bytesRead) break;
        size += part.bytesRead;
      }
      if (size > maxBytes) throw Error();
      bytes = buffer.subarray(0, size);
    } finally { await handle.close(); }
    if (createHash('sha256').update(bytes).digest('hex') !== env.RAG_STATE_SHA256) throw Error();
    const state = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as State;
    if (!record(state) || state.schema !== 1 || !record(state.documents) || !record(state.chunks) || !record(state.vectors)
      || !record(state.usage) || ![state.usage.calls, state.usage.characters].every(n => Number.isSafeInteger(n) && n >= 0)) throw Error();
    for (const [id, doc] of Object.entries(state.documents)) {
      validateDocument(doc);
      if (id !== doc.id || !Number.isSafeInteger(doc.version) || doc.version < 1 || hash(doc.content) !== doc.contentHash) throw Error();
    }
    for (const [id, chunk] of Object.entries(state.chunks)) {
      const doc = state.documents[chunk.documentId];
      if (!doc || id !== chunk.id || chunk.version !== doc.version || !Number.isInteger(chunk.start) || !Number.isInteger(chunk.end)
        || chunk.start < 0 || chunk.end <= chunk.start || chunk.end > doc.content.length || typeof chunk.text !== 'string'
        || doc.content.slice(chunk.start, chunk.end) !== chunk.text || hash(chunk.text) !== chunk.contentHash) throw Error();
    }
    for (const [id, vector] of Object.entries(state.vectors)) {
      if (!state.chunks[id] || !vector || typeof vector.profile !== 'string' || !vector.profile
        || !Array.isArray(vector.values) || !vector.values.length || !vector.values.every(Number.isFinite)) throw Error();
    }
    restored = emptyState();
    validateKdcaLifecycle(state.kdcaLifecycle);
    if (durable) await applySupabaseKdcaControls(state, env, controlTransport);
    if (state.kdcaLifecycle) restored.kdcaLifecycle = structuredClone(state.kdcaLifecycle);
    for (const [id, doc] of Object.entries(state.documents)) {
      if (doc.rights.permission !== 'permitted' || !hasPermission(doc, 'local_search') || !hasPermission(doc, 'quotation')
        || isKdcaDocument(doc) && !kdcaUseAllowed(doc)) continue;
      restored.documents[id] = doc;
    }
    for (const [id, chunk] of Object.entries(state.chunks)) {
      const doc = restored.documents[chunk.documentId];
      if (hasChunkPermission(doc, chunk, 'local_search') && hasChunkPermission(doc, chunk, 'quotation')) restored.chunks[id] = chunk;
    }
    // Keyword retrieval only. Never restore external embedding caches or ingestion jobs.
  } catch { throw Error('RAG_RESTORE_INVALID'); }
  try {
    await repo.transaction(state => {
      if (!durable) {
      // A local stop/deletion outranks an older active snapshot, even without its document.
      restored.kdcaLifecycle ??= {};
      for (const [id, control] of Object.entries(state.kdcaLifecycle ?? {})) {
        if (control.status !== 'active' || !restored.kdcaLifecycle[id] || restored.kdcaLifecycle[id]!.status === 'active')
          restored.kdcaLifecycle[id] = structuredClone(control);
      }
      for (const doc of Object.values(restored.documents)) {
        if (isKdcaDocument(doc) && !state.kdcaLifecycle?.[doc.id]) {
          // Lost/ephemeral disk must not revive an old active snapshot. Initial
          // activation requires the existing reviewed registration on durable storage.
          restored.kdcaLifecycle[doc.id] = { ...restored.kdcaLifecycle[doc.id],
            status: 'refresh_failed', reviewer: 'restoreCorpus: local control record missing', changedAt: new Date().toISOString() };
        }
      }
      applyKdcaLifecycle(restored);
      }
      for (const key of Object.keys(state)) delete (state as unknown as Record<string, unknown>)[key];
      Object.assign(state, restored);
    });
  } catch { throw Error('RAG_RESTORE_WRITE_FAILED'); }
  return { status: 'RAG_RESTORE_OK', documents: Object.keys(restored.documents).length };
}
