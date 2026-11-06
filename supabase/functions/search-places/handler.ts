import { categoryCode, normalizeKakao, validateQuery } from '../_shared/placeContract.ts';
import { LIMIT_SCRIPT } from '../_shared/rateLimit.ts';
export { LIMIT_SCRIPT } from '../_shared/rateLimit.ts';

type LimiterCode = 'NETWORK' | 'TIMEOUT' | 'AUTH' | 'ACL' | 'EVAL_ARGUMENTS' | 'SCRIPT_OR_DATA' | 'PROVIDER_LIMIT' | 'HTTP_ERROR' | 'INVALID_RESPONSE' | 'COMMAND_ERROR';
type LimiterDiagnostic = { event: 'SEARCH_LIMITER_FAILURE'; code: LimiterCode; httpStatus: number | null };
type Dependencies = { env: (key: string) => string | undefined; fetch: typeof fetch; now?: () => number; diagnose?: (event: LimiterDiagnostic) => void };
// Atomic shared counters, not isolate-local limits. No IP/location/query stored.
class Failure extends Error { constructor(public code: string, public status: number) { super(code); } }
class LimiterFailure extends Error {
  constructor(public code: LimiterCode, public httpStatus: number | null) { super(code); }
}
function limiterError(status: number, data: unknown): LimiterCode {
  const error = data && typeof data === 'object' && 'error' in data ? (data as { error: unknown }).error : null;
  // Inspect only in memory. Never emit provider text, keys, URLs or request bodies.
  const text = typeof error === 'string' ? error : '';
  if (status === 401 || /WRONGPASS|NOAUTH|invalid.*token|unauthorized/i.test(text)) return 'AUTH';
  if (/NOPERM|permission|ACL/i.test(text)) return 'ACL';
  if (/wrong number|numkeys|number of keys|argument/i.test(text)) return 'EVAL_ARGUMENTS';
  if (/WRONGTYPE|script|Lua|not.*integer/i.test(text)) return 'SCRIPT_OR_DATA';
  if (status === 429) return 'PROVIDER_LIMIT';
  if (status === 403) return 'ACL';
  return status >= 200 && status < 300 ? 'COMMAND_ERROR' : 'HTTP_ERROR';
}
async function fetchLimiter(fetcher: typeof fetch, url: string, init: RequestInit): Promise<0 | 1> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 3000);
  let status: number | null = null;
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal, redirect: 'error' }); status = response.status;
    let data: unknown;
    try { data = await bodyJson(response, 4096); }
    catch {
      if (controller.signal.aborted) throw new LimiterFailure('TIMEOUT', status);
      throw new LimiterFailure(response.ok ? 'INVALID_RESPONSE' : limiterError(status, null), status);
    }
    if (!response.ok) throw new LimiterFailure(limiterError(status, data), status);
    if (!data || typeof data !== 'object') throw new LimiterFailure('INVALID_RESPONSE', status);
    const result = data as { result?: unknown; error?: unknown };
    if (result.error !== undefined) throw new LimiterFailure(limiterError(status, data), status);
    if (result.result !== 0 && result.result !== 1) throw new LimiterFailure('INVALID_RESPONSE', status);
    return result.result;
  } catch (error) {
    if (error instanceof LimiterFailure) throw error;
    throw new LimiterFailure(controller.signal.aborted ? 'TIMEOUT' : 'NETWORK', status);
  } finally { clearTimeout(timer); }
}
async function fetchBounded(fetcher: typeof fetch, url: string, init: RequestInit, ms: number) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    return { ok: response.ok, status: response.status, data: response.ok ? await bodyJson(response, 65536) : null };
  } finally { clearTimeout(timer); }
}
async function bodyJson(request: Request | Response, maxBytes = 2048): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Failure('INVALID_INPUT', 400);
  let size = 0, expired = false;
  const chunks: Uint8Array[] = [];
  const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => undefined); }, 3000);
  try {
    while (true) {
      const item = await reader.read();
      if (expired) throw new Failure('INVALID_INPUT', 408);
      if (item.done) break;
      size += item.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Failure('INVALID_INPUT', 413); }
      chunks.push(item.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) { if (e instanceof Failure) throw e; throw new Failure('INVALID_INPUT', 400); }
  finally { clearTimeout(timer); reader.releaseLock(); }
}
function limit(value: string | undefined, fallback: number, max: number): number {
  if (!value) return fallback;
  const n = Number(value); if (!Number.isInteger(n) || n < 1 || n > max) throw new Failure('NOT_CONFIGURED', 503);
  return n;
}
export function createHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const allowed = (deps.env('SEARCH_ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
    // Browser origins are an allowlist, not authentication. Native callers have
    // no Origin; shared limits still apply. Never trust client-supplied IPs.
    if (origin && !allowed.includes(origin)) return json({ code: 'ORIGIN_DENIED' }, 403);
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') {
      headers['Access-Control-Allow-Methods'] = 'POST'; headers['Access-Control-Allow-Headers'] = 'content-type';
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
    try {
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new Failure('INVALID_INPUT', 400);
      let query;
      try { query = validateQuery(await bodyJson(request)); } catch (e) { if (e instanceof Failure) throw e; throw new Failure('INVALID_INPUT', 400); }
      if (deps.env('SEARCH_PUBLIC_ENABLED') !== 'true') throw new Failure('PUBLIC_DISABLED', 503);
      const kakaoKey = deps.env('KAKAO_REST_API_KEY');
      if (!kakaoKey?.trim()) throw new Failure('KAKAO_NOT_CONFIGURED', 503);
      const redisUrl = deps.env('UPSTASH_REDIS_REST_URL'), redisToken = deps.env('UPSTASH_REDIS_REST_TOKEN');
      let redis: URL;
      try {
        redis = new URL(redisUrl ?? '');
        if (redis.protocol !== 'https:' || !redis.hostname.endsWith('.upstash.io') || redis.port || redis.username || redis.password || redis.pathname !== '/' || redis.search || redis.hash || !redisToken) throw Error();
      } catch { throw new Failure('NOT_CONFIGURED', 503); }
      const caps = [limit(deps.env('SEARCH_MAX_PER_MINUTE'), 30, 60), limit(deps.env('SEARCH_MAX_PER_DAY'), 500, 1000), limit(deps.env('SEARCH_MAX_PER_MONTH'), 5000, 10000)];
      const now = deps.now?.() ?? Date.now(), iso = new Date(now).toISOString();
      let admission;
      try {
        admission = await fetchLimiter(deps.fetch, redis.origin, { method: 'POST', headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(['EVAL', LIMIT_SCRIPT, '3', `drmas:places:minute:${Math.floor(now / 60000)}`, `drmas:places:day:${iso.slice(0, 10)}`, `drmas:places:month:${iso.slice(0, 7)}`, ...caps.map(String), '120', '172800', '3456000']) });
      } catch (error) {
        const failure = error instanceof LimiterFailure ? error : new LimiterFailure('INVALID_RESPONSE', null);
        try { deps.diagnose?.({ event: 'SEARCH_LIMITER_FAILURE', code: failure.code, httpStatus: failure.httpStatus }); } catch { /* Logging cannot admit a request. */ }
        throw new Failure('LIMITER_UNAVAILABLE', 503);
      }
      if (admission !== 1) { headers['Retry-After'] = '60'; throw new Failure('RATE_LIMITED', 429); }
      const url = new URL(`https://dapi.kakao.com/v2/local/search/${query.mode === 'nearby' ? 'category' : 'keyword'}.json`);
      url.searchParams.set('category_group_code', categoryCode(query.category));
      url.searchParams.set('size', '15'); url.searchParams.set('page', String(query.page));
      if (query.mode === 'keyword') url.searchParams.set('query', query.query);
      if (query.coordinates) {
        url.searchParams.set('x', String(query.coordinates.longitude)); url.searchParams.set('y', String(query.coordinates.latitude));
      }
      if (query.mode === 'nearby') { url.searchParams.set('radius', '3000'); url.searchParams.set('sort', 'distance'); }
      else url.searchParams.set('sort', 'accuracy');
      let response;
      try { response = await fetchBounded(deps.fetch, url.toString(), { headers: { Authorization: `KakaoAK ${kakaoKey}` } }, 8000); }
      catch { throw new Failure('UPSTREAM_UNAVAILABLE', 502); }
      if (response.status === 401 || response.status === 403) throw new Failure('KAKAO_KEY_REJECTED', 503);
      if (response.status === 429) throw new Failure('PROVIDER_LIMITED', 429);
      if (!response.ok) throw new Failure('UPSTREAM_UNAVAILABLE', 502);
      try { return json(normalizeKakao(response.data, query)); } catch { throw new Failure('UPSTREAM_UNAVAILABLE', 502); }
    } catch (e) {
      const failure = e instanceof Failure ? e : new Failure('UNAVAILABLE', 503);
      return json({ code: failure.code }, failure.status);
    }
  };
}
