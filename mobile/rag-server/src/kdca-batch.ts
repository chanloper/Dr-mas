import { mkdtemp, mkdir, readFile, writeFile, rename, open, unlink, realpath } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from './model.js';
import { kdcaLimits, type KdcaContent } from './kdca-catalog.js';
import { KdcaError, parseKdcaXml, kdcaDocument, type KdcaPayload } from './kdca-healthinfo.js';
import { LocalRepository, register } from './repository.js';

/** No default network transport, TOKEN loading, scheduler or production import. */
export type KdcaLoader = (entry: KdcaContent, signal?: AbortSignal) => Promise<KdcaPayload>;
type Item = { attempts: number; status: 'pending'|'saved'|'done'|'failed'; error?: string; rawHash?: string; collectedAt?: string };
type Checkpoint = { schema: 1; catalog: string; nextAt: number; items: Record<string, Item> };
export type BatchPolicy = { intervalMs: number; maxAttempts: number; retryDelayMs: number };
const live = fileURLToPath(new URL('../data/local/', import.meta.url));
const marker = 'drmas-kdca-staging-v1';
async function isolated(path: string) {
  const actual = await realpath(path);
  const delta = relative(await realpath(live), actual);
  if (!delta || (!delta.startsWith('..') && !isAbsolute(delta))) throw Error('KDCA_LIVE_STORE_FORBIDDEN');
  return actual;
}
export function validateKdcaCatalog(entries: readonly KdcaContent[]) {
  const ids = new Set<string>(), urls = new Set<string>();
  if (!entries.length || entries.length > 1000) throw Error('KDCA_INVALID_CATALOG');
  for (const entry of entries) {
    const url = new URL(entry.sourceUrl);
    if (!/^\d{1,10}$/.test(entry.contentId) || !entry.expectedTitle.trim() ||
      url.protocol !== 'https:' || url.hostname !== 'health.kdca.go.kr' || url.username || url.password || url.hash ||
      [...url.searchParams.keys()].some(key => key !== 'cntnts_sn') || url.searchParams.get('cntnts_sn') !== entry.contentId ||
      !/^[A-Z][A-Z0-9_]*$/.test(entry.tokenEnvName) || entry.tokenEnvName.startsWith('EXPO_PUBLIC_') ||
      ids.has(entry.contentId) || urls.has(entry.sourceUrl)) throw Error('KDCA_INVALID_CATALOG');
    ids.add(entry.contentId); urls.add(entry.sourceUrl);
  }
}
export async function createKdcaStaging(parent: string) {
  const safe = await isolated(parent);
  const directory = await mkdtemp(join(safe, 'kdca-staging-'));
  await writeFile(join(directory, 'workspace.json'), JSON.stringify({ marker }), { mode: 0o600 });
  return directory;
}
async function atomic(path: string, value: unknown) {
  const temp = path + '.tmp';
  await writeFile(temp, JSON.stringify(value), { mode: 0o600 });
  await rename(temp, path);
}
/** Each new workspace is a collection/update run. Resume reuses the same catalog and policy. */
export async function runKdcaBatch(options: {
  directory: string; entries: readonly KdcaContent[]; policy: BatchPolicy; load: KdcaLoader;
  maxRequests: number; signal?: AbortSignal;
  offlineReview?: boolean;
  now?: () => number; sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}) {
  validateKdcaCatalog(options.entries);
  const { policy } = options;
  if (policy.intervalMs < kdcaLimits.minIntervalMs || ![policy.intervalMs, policy.retryDelayMs].every(n => Number.isSafeInteger(n) && n >= 1) ||
    !Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1 || policy.maxAttempts > 5 ||
    !Number.isInteger(options.maxRequests) || options.maxRequests < 1 || options.maxRequests > 1000) throw Error('KDCA_INVALID_POLICY');
  const directory = await isolated(options.directory);
  if (JSON.parse(await readFile(join(directory, 'workspace.json'), 'utf8')).marker !== marker) throw Error('KDCA_INVALID_WORKSPACE');
  const lockPath = join(directory, 'batch.lock');
  const lock = await open(lockPath, 'wx').catch(() => { throw Error('KDCA_BATCH_BUSY'); });
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms, signal) => new Promise<void>((done, reject) => {
    if (signal?.aborted) { reject(new KdcaError('CANCELLED')); return; }
    const abort = () => { clearTimeout(timer); reject(new KdcaError('CANCELLED')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); done(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  }));
  const checkpointPath = join(directory, 'checkpoint.json');
  try {
    const catalog = hash(JSON.stringify({ entries: options.entries, policy, ...(options.offlineReview ? { offlineReview: true } : {}) }));
    let state: Checkpoint;
    try { state = JSON.parse(await readFile(checkpointPath, 'utf8')) as Checkpoint; }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw Error('KDCA_INVALID_CHECKPOINT');
      state = { schema: 1, catalog, nextAt: 0, items: Object.fromEntries(options.entries.map(e => [e.contentId, { attempts: 0, status: 'pending' as const }])) };
    }
    if (state.schema !== 1 || state.catalog !== catalog) throw Error('KDCA_CATALOG_CHANGED');
    if (!Number.isFinite(state.nextAt) || Object.keys(state.items).length !== options.entries.length || options.entries.some(entry => {
      const item = state.items[entry.contentId];
      return !item || !Number.isInteger(item.attempts) || item.attempts < 0 || item.attempts > policy.maxAttempts ||
        !['pending','saved','done','failed'].includes(item.status) ||
        (item.rawHash !== undefined && !/^[a-f0-9]{64}$/.test(item.rawHash)) ||
        (['saved','done'].includes(item.status) && (!item.rawHash || !item.collectedAt || !Number.isFinite(Date.parse(item.collectedAt))));
    })) throw Error('KDCA_INVALID_CHECKPOINT');
    const repo = new LocalRepository(join(directory, 'candidates'));
    await mkdir(join(directory, 'raw'), { recursive: true });
    let requests = 0;
    for (const entry of options.entries) {
      const item = state.items[entry.contentId]!;
      if (item.status === 'done' || item.status === 'failed') continue;
      while (item.status === 'pending' && item.attempts < policy.maxAttempts && requests < options.maxRequests) {
        if (options.signal?.aborted) throw new KdcaError('CANCELLED');
        await sleep(Math.max(0, state.nextAt - now()), options.signal);
        if (options.signal?.aborted) throw new KdcaError('CANCELLED');
        item.attempts++; requests++; state.nextAt = now() + policy.intervalMs;
        await atomic(checkpointPath, state); // Persist attempt before any external operation.
        try {
          const payload = await options.load(entry, options.signal);
          // Reparse to bind loader output to exact raw XML, expected ID and title.
          parseKdcaXml(payload.rawXml, entry, { offlineReview: options.offlineReview });
          item.rawHash = hash(payload.rawXml); item.collectedAt = new Date(now()).toISOString();
          await writeFile(join(directory, 'raw', item.rawHash + '.xml'), payload.rawXml, { mode: 0o600 });
          item.status = 'saved'; delete item.error;
        } catch (e) {
          const error = e instanceof KdcaError ? e : new KdcaError('INVALID_RESPONSE');
          item.error = error.message;
          const retry = error.code === 'NETWORK' || error.code === 'TIMEOUT' ||
            (error.code === 'HTTP' && error.httpStatus !== undefined && error.httpStatus >= 500 && error.httpStatus <= 599);
          // 429 is deferred for manual review until official Retry-After/quota policy is confirmed.
          if ((!retry && error.code !== 'CANCELLED') || item.attempts >= policy.maxAttempts) item.status = 'failed';
          state.nextAt = Math.max(state.nextAt, now() + policy.retryDelayMs * 2 ** (item.attempts - 1));
          await atomic(checkpointPath, state);
          if (error.code === 'CANCELLED') throw error;
        }
        await atomic(checkpointPath, state);
      }
      if (item.status === 'pending' && item.attempts >= policy.maxAttempts) {
        item.status = 'failed'; item.error = 'KDCA_ATTEMPTS_EXHAUSTED'; await atomic(checkpointPath, state);
      }
      if (item.status === 'saved') {
        const raw = await readFile(join(directory, 'raw', item.rawHash + '.xml'), 'utf8');
        if (hash(raw) !== item.rawHash) throw Error('KDCA_RAW_INTEGRITY');
        await register(repo, kdcaDocument(parseKdcaXml(raw, entry, { offlineReview: options.offlineReview }), entry, item.collectedAt!));
        item.status = 'done'; await atomic(checkpointPath, state);
      }
    }
    return { directory: resolve(directory), requests, items: structuredClone(state.items) };
  } finally { await lock.close(); await unlink(lockPath); }
}
