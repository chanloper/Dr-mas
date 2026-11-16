// Server-side metadata only. No document text, API TOKEN, embedding or generation.
import type { State } from './model.js';
import type { Repository } from './repository.js';
import { isKdcaDocument } from './kdca-use.js';
import { kdcaLimits } from './kdca-catalog.js';
import { applyKdcaLifecycle, type KdcaLifecycleRecord } from './kdca-lifecycle.js';

type Env = Record<string, string | undefined>;
type ControlRow = {
  content_id: string; status: KdcaLifecycleRecord['status']; raw_hash: string; content_hash: string;
  snapshot_sha256: string; document_version: number; verified_at: string; operator: string; updated_at: string; revision: number;
};
function configuration(env: Env) {
  const url = new URL(env.SUPABASE_URL ?? '');
  const key = env.RAG_KDCA_CONTROL_SERVICE_KEY;
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/'
    || !key || /[\s\r\n]/u.test(key) || !/^[a-f0-9]{64}$/.test(env.RAG_STATE_SHA256 ?? '')) throw Error();
  const headers: Record<string,string> = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
  return { url: new URL('/rest/v1/rag_kdca_controls', url), headers };
}
async function rows(response: Response): Promise<ControlRow[]> {
  if (!response.ok || Number(response.headers.get('content-length')) > 16000 || !response.body) throw Error();
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 16000) throw Error();
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  if (!Array.isArray(value) || value.length > 1) throw Error();
  return value;
}
async function readRow(id: string, env: Env, transport: typeof fetch) {
  const { url, headers } = configuration(env);
  url.searchParams.set('content_id', 'eq.' + id);
  url.searchParams.set('select', 'content_id,status,raw_hash,content_hash,snapshot_sha256,document_version,verified_at,operator,updated_at,revision');
  url.searchParams.set('limit','2');
  const result = await rows(await transport(url, { headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(2000) }));
  if (result.length !== 1) throw Error();
  return result[0]!;
}
export async function readSupabaseKdcaControls(state: State, env: Env, transport: typeof fetch = fetch): Promise<NonNullable<State['kdcaLifecycle']>> {
  const result: NonNullable<State['kdcaLifecycle']> = {};
  for (const doc of Object.values(state.documents).filter(isKdcaDocument)) {
    const id = doc.id, contentId = id.replace(/^kdca-/,''), baseline = state.kdcaLifecycle?.[id];
    let control: KdcaLifecycleRecord = { status: 'refresh_failed', reviewer: 'Supabase control unavailable or invalid',
      changedAt: new Date().toISOString(), rawHash: baseline?.rawHash, contentHash: doc.contentHash };
    try {
      if (!/^kdca-\d{1,10}$/.test(id)) throw Error();
      const row = await readRow(contentId, env, transport), now = Date.now(), verified = Date.parse(row.verified_at);
      if (row.content_id !== contentId || row.snapshot_sha256 !== env.RAG_STATE_SHA256
        || row.raw_hash !== baseline?.rawHash || !/^[a-f0-9]{64}$/.test(row.raw_hash)
        || row.content_hash !== doc.contentHash || row.document_version !== doc.version
        || !['active','revoked','changed_pending_review','refresh_failed'].includes(row.status)
        || typeof row.operator !== 'string' || !row.operator.trim() || row.operator.length > 100
        || !Number.isFinite(Date.parse(row.updated_at)) || Date.parse(row.updated_at) > now
        || !Number.isSafeInteger(row.revision) || row.revision < 1
        || !Number.isFinite(verified) || verified > now || now - verified >= kdcaLimits.refreshIntervalMs) throw Error();
      control = { status: row.status, reviewer: row.operator, changedAt: row.updated_at,
        rawHash: row.raw_hash, contentHash: row.content_hash, lastVerifiedAt: row.verified_at };
    } catch { /* No raw upstream errors, credentials or URLs in logs. No cached-active fallback. */ }
    result[id] = control;
  }
  return result;
}
export async function applySupabaseKdcaControls(state: State, env: Env, transport: typeof fetch = fetch) {
  state.kdcaLifecycle = await readSupabaseKdcaControls(state, env, transport);
  for (const [id, control] of Object.entries(state.kdcaLifecycle)) {
    const doc = state.documents[id];
    if (control.status === 'active' && doc?.rights.permission === 'permitted' && doc.rights.kdcaUse?.status === 'active')
      doc.rights.kdcaUse.lastVerifiedAt = control.lastVerifiedAt!;
  }
  applyKdcaLifecycle(state);
}
// Read on every request, including health cards. The local snapshot never grants a durable active state.
export function withSupabaseKdcaControls(repo: Repository, env: Env, transport: typeof fetch = fetch): Repository {
  return {
    read: async () => { const state = await repo.read(); await applySupabaseKdcaControls(state, env, transport); return state; },
    transaction: action => repo.transaction(action),
  };
}
export async function stopSupabaseKdca(contentId: string, status: 'revoked' | 'changed_pending_review', operator: string, env: Env, transport: typeof fetch = fetch) {
  try {
    if (!/^\d{1,10}$/.test(contentId) || !['revoked','changed_pending_review'].includes(status) || !operator.trim() || operator.length > 100) throw Error();
    const row = await readRow(contentId, env, transport), { url, headers } = configuration(env);
    if (!Number.isSafeInteger(row.revision) || row.revision < 1) throw Error();
    url.searchParams.set('content_id','eq.' + contentId);
    url.searchParams.set('revision','eq.' + row.revision);
    const updated = await rows(await transport(url, { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ status, operator, updated_at: new Date().toISOString(), revision: row.revision + 1 }),
      redirect: 'error', signal: AbortSignal.timeout(2000) }));
    if (updated.length !== 1 || updated[0]!.status !== status || updated[0]!.revision !== row.revision + 1) throw Error();
    return { contentId, status, persisted: true };
  } catch { throw Error('KDCA_DURABLE_STOP_FAILED'); }
}
