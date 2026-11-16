import { validateDurDrugs, validateDurSearch, type DurResult, type DurSearchInput, type DurCandidate, type DurDrug } from '../_shared/durContract.ts';
import { LIMIT_SCRIPT } from '../_shared/rateLimit.ts';
import { headacheOtc, approvalSearchRequest } from '../_shared/headacheOtc.ts';

type Diagnostic = { providerResultCode: string | null; totalCount: number | null; beforeFilter: number | null; afterFilter: number | null; elapsedMs: number };
type Deps = { env: (key: string) => string | undefined; fetch: typeof fetch; diagnose?: (value: Diagnostic) => void };
class Failure extends Error { constructor(public code: string, public status = 503) { super(code); } }
// Bounded JSON reading shared by request, auth and provider responses. Never log bodies/URLs.
async function jsonBody(body: Request | Response, max: number, signal: AbortSignal): Promise<unknown> {
  const reader = body.body?.getReader(); if (!reader) throw new Failure('INVALID_RESPONSE');
  const stop = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', stop, { once: true });
  let bytes = 0; const parts: Uint8Array[] = [];
  try {
    while (true) {
      if (signal.aborted) throw new Failure('TIMEOUT', 504);
      const next = await reader.read(); if (signal.aborted) throw new Failure('TIMEOUT', 504); if (next.done) break;
      bytes += next.value.length; if (bytes > max) { await reader.cancel(); throw new Failure('BODY_TOO_LARGE', 413); }
      parts.push(next.value);
    }
    const result = new Uint8Array(bytes); let offset = 0;
    for (const p of parts) { result.set(p, offset); offset += p.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(result));
  } finally { signal.removeEventListener('abort', stop); reader.releaseLock(); }
}
type Row = Record<string, unknown>;
function readPage(value: unknown, expectedPage: number): { rows: Row[]; total: number } {
  // Accept direct header/body and the standard response envelope; XML/errors fail closed.
  const outer = value as { response?: unknown } | null;
  const r = (outer?.response ?? value) as { header?: { resultCode?: unknown }; body?: { items?: unknown; totalCount?: unknown; pageNo?: unknown; numOfRows?: unknown } };
  if (!r || !['00', '0'].includes(String(r.header?.resultCode))) throw new Failure('PROVIDER_REJECTED', 502);
  if (!['number', 'string'].includes(typeof r.body?.totalCount) || r.body?.totalCount === '') throw new Failure('PROVIDER_RESPONSE_INVALID', 502);
  const total = Number(r.body?.totalCount);
  if (!Number.isSafeInteger(total) || total < 0) throw new Failure('PROVIDER_RESPONSE_INVALID', 502);
  if(r.body?.pageNo!==undefined&&Number(r.body.pageNo)!==expectedPage)throw new Failure('PROVIDER_RESPONSE_INVALID',502);
  let items = r.body?.items;
  if (items && !Array.isArray(items) && typeof items === 'object' && 'item' in items) items = (items as { item: unknown }).item;
  const rows = items === undefined || items === null || items === '' ? [] : Array.isArray(items) ? items : [items];
  if(r.body?.numOfRows!==undefined&&(!Number.isInteger(Number(r.body.numOfRows))||Number(r.body.numOfRows)<1||Number(r.body.numOfRows)>100||rows.length>Number(r.body.numOfRows)))throw new Failure('PROVIDER_RESPONSE_INVALID',502);
  if (rows.length > 100 || rows.some(x => !x || typeof x !== 'object' || Array.isArray(x)) || rows.length > total) throw new Failure('PROVIDER_RESPONSE_INVALID', 502);
  return { rows: (rows as Row[]).map(row => ({ ...row,
    ITEM_SEQ: typeof row.ITEM_SEQ === 'number' && Number.isSafeInteger(row.ITEM_SEQ) ? String(row.ITEM_SEQ) : row.ITEM_SEQ,
    MIXTURE_ITEM_SEQ: typeof row.MIXTURE_ITEM_SEQ === 'number' && Number.isSafeInteger(row.MIXTURE_ITEM_SEQ) ? String(row.MIXTURE_ITEM_SEQ) : row.MIXTURE_ITEM_SEQ,
  })), total };
}
function cap(value: string | undefined, fallback: number, max: number): number {
  if (!value) return fallback;
  const n = Number(value); if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new Failure('NOT_CONFIGURED');
  return n;
}
function candidatesFrom(rows: Row[], query: string): DurCandidate[] {
  const candidates = new Map<string, DurCandidate>();
  const optional = (v: unknown, max = 300) => typeof v === 'string' && v.trim() && v.length <= max && !/[\u0000-\u001f<>]/u.test(v) ? v.trim() : null;
  for (const row of rows) {
    if (typeof row.ITEM_NAME !== 'string' || !row.ITEM_NAME.includes(query) || typeof row.ITEM_SEQ !== 'string'
      || row.CANCEL_NAME !== '정상' || row.CANCEL_DATE != null && row.CANCEL_DATE !== '') continue;
    try { validateDurDrugs([{ name: row.ITEM_NAME, itemSeq: row.ITEM_SEQ }]); } catch { continue; }
    if (!candidates.has(row.ITEM_SEQ)) candidates.set(row.ITEM_SEQ, { name: row.ITEM_NAME, itemSeq: row.ITEM_SEQ, manufacturer: optional(row.ENTP_NAME), ingredient: optional(row.ITEM_INGR_NAME) });
  }
  return [...candidates.values()];
}
export function createHandler(deps: Deps) {
  // Per-isolate user burst defense supplements the shared provider quota below.
  const limits = new Map<string, { count: number; until: number }>();
  return async (request: Request): Promise<Response> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
    const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
    const origin = request.headers.get('origin');
    if (origin && !(deps.env('DUR_ALLOWED_ORIGINS') ?? '').split(',').map(x => x.trim()).includes(origin)) return reply({ code: 'ORIGIN_DENIED' }, 403);
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') {
      headers['Access-Control-Allow-Methods'] = 'POST'; headers['Access-Control-Allow-Headers'] = 'authorization,apikey,content-type,x-client-info';
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') return reply({ code: 'METHOD_NOT_ALLOWED' }, 405);
    const controller = new AbortController(); const abort = () => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
    // Finish before the DUR-only 45s client transport / 50s operation deadlines.
    const timer = setTimeout(abort, 40000);
    const bounded = async <T>(work: Promise<T>): Promise<T> => {
      if (controller.signal.aborted) throw new Failure('TIMEOUT', 504);
      return new Promise<T>((resolve, reject) => {
        const stop = () => reject(new Failure('TIMEOUT', 504)); controller.signal.addEventListener('abort', stop, { once: true });
        work.then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', stop));
      });
    };
    const fetchJson = async (url: string | URL, init: RequestInit, max = 524288) => {
      const response = await bounded(deps.fetch(url, { ...init, signal: controller.signal, redirect: 'error' }));
      if (!response.ok) throw new Failure('UPSTREAM_UNAVAILABLE', 502);
      try{return await bounded(jsonBody(response, max, controller.signal));}
      catch(error){if(error instanceof Failure)throw error;throw new Failure('PROVIDER_RESPONSE_INVALID',502);}
    };
    try {
      if (deps.env('DUR_ENABLED') !== 'true') throw new Failure('NOT_CONFIGURED');
      if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new Failure('INVALID_INPUT', 400);
      const token = request.headers.get('authorization');
      if (!token || !/^Bearer [A-Za-z0-9._-]{1,8192}$/.test(token)) throw new Failure('AUTH_REQUIRED', 401);
      const base = new URL(deps.env('SUPABASE_URL') ?? '');
      if (base.protocol !== 'https:' || !base.hostname.endsWith('.supabase.co') || base.username || base.password || base.pathname !== '/' || base.search || base.hash || base.port) throw new Failure('NOT_CONFIGURED');
      // SUPABASE_* names are platform-managed. Optional custom publishable key,
      // otherwise use the platform's anon key; never a secret/service-role key.
      const key = deps.env('DUR_SUPABASE_PUBLISHABLE_KEY') ?? deps.env('SUPABASE_PUBLISHABLE_KEY') ?? deps.env('SUPABASE_ANON_KEY');
      let publicKey = !!key?.startsWith('sb_publishable_');
      if (key && !publicKey && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
        try { publicKey = JSON.parse(atob(key.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; } catch { /* Reject malformed keys. */ }
      }
      if (!key || !publicKey) throw new Failure('NOT_CONFIGURED');
      const auth = await bounded(deps.fetch(new URL('/auth/v1/user', base), { headers: { apikey: key, Authorization: token }, signal: controller.signal, redirect: 'error' }));
      if (auth.status === 401 || auth.status === 403) throw new Failure('AUTH_REQUIRED', 401);
      if (!auth.ok) throw new Failure('AUTH_UNAVAILABLE');
      const user = await bounded(jsonBody(auth, 32768, controller.signal)) as { id?: unknown; is_anonymous?: unknown };
      if (typeof user?.id !== 'string' || !user.id || user.is_anonymous === true) throw new Failure('AUTH_REQUIRED', 401);
      const now = Date.now();
      for (const [id, entry] of limits) if (entry.until <= now) limits.delete(id);
      const entry = limits.get(user.id) ?? { count: 0, until: now + 60000 };
      if (limits.size >= 1000 && !limits.has(user.id) || ++entry.count > 5) throw new Failure('RATE_LIMITED', 429);
      limits.set(user.id, entry);
      let drugs: DurDrug[]; let search: DurSearchInput | null = null; let relatedOtc = false;
      try {
        const body = await bounded(jsonBody(request, 4096, controller.signal)) as Record<string, unknown>;
        if(body?.mode==='related-otc') {
          if(body.symptom!=='두통'||Object.keys(body).some(key=>!['mode','symptom'].includes(key)))throw Error();
          relatedOtc=true;drugs=[];
        }
        else if (body?.mode === 'search') { search = validateDurSearch(body); drugs = [{ name: search.query }]; }
        else {
          if (!body || Object.keys(body).some(k => k !== 'drugs')) throw Error();
          drugs = validateDurDrugs(body.drugs);
          if(drugs.some(drug=>!drug.itemSeq))throw Error();
        }
      } catch { throw new Failure('INVALID_INPUT', 400); }
      const secret = deps.env('MFDS_DUR_SERVICE_KEY')?.trim(); if (!secret) throw new Failure('NOT_CONFIGURED');
      const redisToken = deps.env('UPSTASH_REDIS_REST_TOKEN'); let redis: URL;
      try {
        redis = new URL(deps.env('UPSTASH_REDIS_REST_URL') ?? '');
        if (redis.protocol !== 'https:' || !redis.hostname.endsWith('.upstash.io') || redis.port || redis.username || redis.password || redis.pathname !== '/' || redis.search || redis.hash || !redisToken) throw Error();
      } catch { throw new Failure('NOT_CONFIGURED'); }
      const caps = [cap(deps.env('DUR_MAX_PER_MINUTE'), 30, 60), cap(deps.env('DUR_MAX_PER_DAY'), 500, 1000), cap(deps.env('DUR_MAX_PER_MONTH'), 5000, 10000)];
      if(relatedOtc) {
        let rawKey:string;try{rawKey=decodeURIComponent(secret);}catch{throw new Failure('NOT_CONFIGURED');}
        const result=await headacheOtc(rawKey,async url=>{
          const time=Date.now(),iso=new Date(time).toISOString();
          let admission;
          try {
            admission=await fetchJson(redis.origin,{method:'POST',headers:{Authorization:`Bearer ${redisToken}`,'Content-Type':'application/json'},
              body:JSON.stringify(['EVAL',LIMIT_SCRIPT,'3',`drmas:dur:minute:${Math.floor(time/60000)}`,`drmas:dur:day:${iso.slice(0,10)}`,`drmas:dur:month:${iso.slice(0,7)}`,...caps.map(String),'120','172800','3456000'])},4096) as {result?:unknown;error?:unknown};
            if(!admission||admission.error||![0,1].includes(Number(admission.result)))throw Error();
          }catch{throw new Failure('LIMITER_UNAVAILABLE');}
          if(admission.result!==1)throw new Failure('RATE_LIMITED',429);
          const value=await fetchJson(url,{});
          if([secret,rawKey,encodeURIComponent(rawKey)].some(key=>JSON.stringify(value).includes(key)))throw new Failure('PROVIDER_RESPONSE_INVALID',502);
          return value;
        });
        return reply(result);
      }
      const result: DurResult = { status: 'reference_only', drugs: [], warnings: [], notices: [], checkedAt: new Date().toISOString() };
      const collected = drugs.map(() => ({ rows: [] as Row[], total: null as number | null, complete: false, fingerprints: new Set<string>() }));
      const validReason = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 1500 && !/[\u0000-\u001f<>]/u.test(v);
      const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(value);
      const reasonFor = (row: Row): string => validReason(row.PROHBT_CONTENT) ? row.PROHBT_CONTENT :
        row.PROHBT_CONTENT == null || typeof row.PROHBT_CONTENT === 'string' && !row.PROHBT_CONTENT.trim()
          ? '공식 병용금기 등록 정보입니다. API에서 상세 금기 사유를 제공하지 않았습니다.'
          : '공식 병용금기 등록 정보입니다. 상세 금기 사유를 이 화면에 표시할 수 없어 공식 출처에서 확인해야 합니다.';
      const matchesCounterpart = (row: Row, index: number): boolean => {
        if (row.MIXTURE_ITEM_SEQ === drugs[index]!.itemSeq) return true;
        // Official DUR identifiers, not ingredient names. Require the complete
        // code and formulation to occur on the other selected product itself.
        // Never split composite codes or infer missing formulation information.
        return identifier(row.MIXTURE_INGR_CODE) && identifier(row.MIXTURE_FORM_CODE) &&
          collected[index]!.rows.some(other => other.ITEM_SEQ === drugs[index]!.itemSeq &&
            other.INGR_CODE === row.MIXTURE_INGR_CODE && other.FORM_CODE === row.MIXTURE_FORM_CODE);
      };
      const identified = (index: number) => !!drugs[index]!.itemSeq && collected[index]!.rows.some(r => r.ITEM_SEQ === drugs[index]!.itemSeq);
      const allPairsFound = () => drugs.length >= 2 && drugs.every((_, i) => identified(i)) && drugs.every((first, i) => drugs.every((second, j) => j <= i ||
        collected[i]!.rows.some(r => r.ITEM_SEQ === first.itemSeq && matchesCounterpart(r, j)) ||
        collected[j]!.rows.some(r => r.ITEM_SEQ === second.itemSeq && matchesCounterpart(r, i))));
      // Read page one of every selected product before spending the budget on
      // page two. Never infer a pair from product/ingredient name similarity.
      try {
      pagination: for (let pageNo = search?.page ?? 1; pageNo <= (search ? search.page : 10); pageNo++) {
      for (let index = 0; index < drugs.length; index++) {
        const drug = drugs[index]!, state = collected[index]!;
        if (state.complete) continue;
        const time = Date.now(), iso = new Date(time).toISOString();
        let admission;
        try {
          admission = await fetchJson(redis.origin, { method: 'POST', headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(['EVAL', LIMIT_SCRIPT, '3', `drmas:dur:minute:${Math.floor(time / 60000)}`, `drmas:dur:day:${iso.slice(0, 10)}`, `drmas:dur:month:${iso.slice(0, 7)}`, ...caps.map(String), '120', '172800', '3456000']) }, 4096) as { result?: unknown; error?: unknown };
          if (!admission || admission.error || admission.result !== 0 && admission.result !== 1) throw Error();
        } catch (error) { if (error instanceof Failure && error.code === 'TIMEOUT') throw error; throw new Failure('LIMITER_UNAVAILABLE'); }
        if (admission.result === 0) { headers['Retry-After'] = '60'; throw new Failure('RATE_LIMITED', 429); }
        // Portal may supply an encoded key. Decode exactly once before URLSearchParams.
        let rawKey: string; try { rawKey = decodeURIComponent(secret); } catch { throw new Failure('NOT_CONFIGURED'); }
        const url = search ? approvalSearchRequest(rawKey,search.query,search.page)
          : new URL('https://apis.data.go.kr/1471000/DURPrdlstInfoService03/getUsjntTabooInfoList03');
        if(!search){
          url.searchParams.set('serviceKey', rawKey); url.searchParams.set('type', 'json');
          url.searchParams.set('pageNo', String(pageNo)); url.searchParams.set('numOfRows', '100');
          url.searchParams.set('itemSeq', drug.itemSeq!);
        }
        const started=Date.now();
        const diagnostic:Diagnostic={providerResultCode:null,totalCount:null,beforeFilter:null,afterFilter:null,elapsedMs:0};
        try {
        const value=await fetchJson(url, {});
        const outer=value as {response?:unknown};
        const provider=(outer?.response??value) as {header?:{resultCode?:unknown};body?:{totalCount?:unknown}};
        const code=String(provider?.header?.resultCode??'');
        diagnostic.providerResultCode=/^\d{1,2}$/.test(code)?code:null;
        const total=provider?.body?.totalCount;
        if((typeof total==='number'||typeof total==='string'&&total.trim()!=='')&&Number.isSafeInteger(Number(total))&&Number(total)>=0)diagnostic.totalCount=Number(total);
        const page = readPage(value,pageNo);
        diagnostic.beforeFilter=page.rows.length;
        if (search) {
          const candidates=candidatesFrom(page.rows,search.query);
          diagnostic.afterFilter=candidates.length;
          const incomplete=page.rows.length<Math.min(100,Math.max(0,page.total-(search.page-1)*100));
          const remaining = page.total > search.page * 100;
          return reply({ status: 'reference_only', query: search.query, page: search.page, candidates,
            outcome:incomplete?'incomplete':page.total===0?'empty':candidates.length?'matched':'filtered',
            hasMore: remaining && search.page < 3, truncated: remaining||incomplete, checkedAt: result.checkedAt });
        }
        for(const row of page.rows){
          if(row.ITEM_SEQ!==drug.itemSeq)throw new Failure('PROVIDER_RESPONSE_INVALID',502);
          try{validateDurDrugs([{name:row.ITEM_NAME,itemSeq:row.ITEM_SEQ}]);}catch{throw new Failure('PROVIDER_RESPONSE_INVALID',502);}
        }
        if (state.total === null) state.total = page.total;
        else if (state.total !== page.total) throw new Failure('PROVIDER_RESPONSE_INVALID', 502);
        const fingerprint=JSON.stringify(page.rows);
        if(page.rows.length&&state.fingerprints.has(fingerprint)){diagnostic.afterFilter=0;break pagination;}
        state.fingerprints.add(fingerprint);
        diagnostic.afterFilter=page.rows.length;
        state.rows.push(...page.rows);
        state.complete = state.rows.length >= state.total;
        // A short page with an outstanding total is an incomplete result, not
        // permission to declare the remaining combinations safe.
        if (!state.complete && page.rows.length < 100) break pagination;
        if (allPairsFound() || collected.every(s => s.complete)) break pagination;
        } finally {
          diagnostic.elapsedMs=Math.max(0,Date.now()-started);
          try{(deps.diagnose??(value=>console.info(JSON.stringify(value))))(diagnostic);}catch{/* Diagnostics cannot affect verification. */}
        }
      }
      }
      } catch (error) {
        // Preserve already validated pages on the server deadline only. Caller
        // cancellation, rate denial and upstream errors must not become success.
        if (!(error instanceof Failure) || error.code !== 'TIMEOUT' || request.signal.aborted || !collected.some(s => s.rows.length)) throw error;
      }
      const pages: Row[][] = [];
      for (let index = 0; index < drugs.length; index++) {
        const drug = drugs[index]!, state = collected[index]!;
        const rows = state.rows.filter(r => r.ITEM_SEQ === drug.itemSeq && typeof r.ITEM_SEQ === 'string' && /^\d{9}$/.test(r.ITEM_SEQ));
        const candidates = [...new Map(rows.map(r => [r.ITEM_SEQ as string, { name: r.ITEM_NAME as string, itemSeq: r.ITEM_SEQ as string }])).values()];
        result.drugs.push({ name: drug.name, itemSeq: drug.itemSeq ?? null, identityConfirmed: !!drug.itemSeq && rows.some(r => r.ITEM_SEQ === drug.itemSeq), truncated: !state.complete || candidates.length > 20, candidates: candidates.slice(0, 20) });
        pages.push(rows);
      }
      const warningKeys = new Set<string>();
      for (let i = 0; i < drugs.length; i++) {
        if (!result.drugs[i]!.identityConfirmed) continue;
        for (const row of pages[i]!) {
          if (row.ITEM_SEQ !== drugs[i]!.itemSeq) continue;
          const reference = row.PROHBT_CONTENT;
          if (typeof reference === 'string' && reference.trim() && reference.length <= 1500 && !/[\u0000-\u001f<>]/u.test(reference) && result.notices!.length < 100) {
            const counterpart = typeof row.MIXTURE_ITEM_NAME === 'string' && row.MIXTURE_ITEM_NAME.length > 0 && row.MIXTURE_ITEM_NAME.length <= 100 && !/[\u0000-\u001f<>]/u.test(row.MIXTURE_ITEM_NAME) ? row.MIXTURE_ITEM_NAME : null;
            if (!result.notices!.some(n => n.name === drugs[i]!.name && n.counterpart === counterpart && n.content === reference)) result.notices!.push({ name: drugs[i]!.name, counterpart, content: reference });
          }
          for (let j = 0; j < drugs.length; j++) {
            if (j === i || !result.drugs[j]!.identityConfirmed || !matchesCounterpart(row, j)) continue;
            const content = reasonFor(row);
            const pairKey = JSON.stringify([[drugs[i]!.itemSeq, drugs[j]!.itemSeq].sort(), content]);
            if (result.warnings.length < 100 && !warningKeys.has(pairKey)) {
              warningKeys.add(pairKey); result.warnings.push({ first: drugs[i]!.name, second: drugs[j]!.name, content });
            }
          }
        }
      }
      // Public provider identifiers only, never credentials, URLs or health data.
      // Keep raw identity evidence out of logs; inspect it in the authenticated
      // response before changing product-vs-ingredient matching semantics.
      const ingredientCode = (value: unknown): string | null =>
        typeof value === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(value) ? value : null;
      const ingredientCodes = drugs.map((drug, i) => [...new Set(pages[i]!
        .filter(row => row.ITEM_SEQ === drug.itemSeq)
        .map(row => ingredientCode(row.INGR_CODE)).filter((code): code is string => code !== null))]);
      const providerEvidence = drugs.map((drug, i) => {
        const otherItems = new Set(drugs.filter((_, j) => j !== i).map(other => other.itemSeq));
        const otherIngredients = new Set(ingredientCodes.filter((_, j) => j !== i).flat());
        const relevant = pages[i]!.filter(row => row.ITEM_SEQ === drug.itemSeq &&
          (typeof row.MIXTURE_ITEM_SEQ === 'string' && otherItems.has(row.MIXTURE_ITEM_SEQ) ||
            otherIngredients.has(ingredientCode(row.MIXTURE_INGR_CODE) ?? '')));
        return {
          itemSeq: drug.itemSeq ?? null, retrievedRows: collected[i]!.rows.length,
          totalCount: collected[i]!.total, complete: collected[i]!.complete,
          ingredientCodes: ingredientCodes[i], relevantRowCount: relevant.length,
          rows: relevant.slice(0, 20).map(row => ({
            ITEM_SEQ: row.ITEM_SEQ, MIXTURE_ITEM_SEQ: row.MIXTURE_ITEM_SEQ ?? null,
            INGR_CODE: ingredientCode(row.INGR_CODE), MIXTURE_INGR_CODE: ingredientCode(row.MIXTURE_INGR_CODE),
            DUR_SEQ: ingredientCode(row.DUR_SEQ), MIXTURE_DUR_SEQ: ingredientCode(row.MIXTURE_DUR_SEQ),
            MIX: ingredientCode(row.MIX), MIXTURE_MIX: ingredientCode(row.MIXTURE_MIX),
            FORM_CODE: ingredientCode(row.FORM_CODE), MIXTURE_FORM_CODE: ingredientCode(row.MIXTURE_FORM_CODE),
            reasonPresent: validReason(row.PROHBT_CONTENT),
            reasonState: validReason(row.PROHBT_CONTENT) ? 'displayable' :
              row.PROHBT_CONTENT == null || typeof row.PROHBT_CONTENT === 'string' && !row.PROHBT_CONTENT.trim() ? 'empty' : 'not_displayable',
          })),
        };
      });
      return reply({ ...result, providerEvidence, incomplete:collected.some(state=>!state.complete),
        comparisonStatus:result.warnings.length?'matched':result.drugs.every(drug=>drug.identityConfirmed&&!drug.truncated)?'no_registered_match':'unverified' });
    } catch (error) {
      const e = error instanceof Failure ? error : new Failure('UNAVAILABLE');
      return reply({ code: e.code }, e.status);
    } finally { clearTimeout(timer); request.signal.removeEventListener('abort', abort); }
  };
}
