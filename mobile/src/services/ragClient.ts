export class RagError extends Error {
  constructor(public code: string, public stage?: 'session' | 'http' | 'response') { super(code); }
}
export const ragMessages: Record<string, string> = {
  UNAUTHORIZED: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  NETWORK: '건강정보 서버에 연결하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.',
  SESSION_STORAGE: '저장된 로그인 정보를 읽지 못했어요. 앱을 다시 열고 로그인 상태를 확인해 주세요.',
  TIMEOUT: '건강정보 요청을 제시간에 완료하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.',
  AUTH_UNAVAILABLE: '서버에서 로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  RESPONSE: '검색 서버의 응답 형식을 확인하지 못했습니다. 관리자에게 문의해 주세요.',
  RATE_LIMITED: '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
  CONFIG: '자료 검색 서비스 연결이 아직 준비되지 않았어요. 잠시 후 다시 확인해 주세요.',
  INVALID_INPUT: '질문은 1~2000자로 입력해 주세요.',
  SERVER: '자료를 가져오는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
  CANCELLED: '요청을 취소했습니다. 서버의 검색 작업 종료 여부까지 보장하지는 않습니다.',
};
export function ragErrorMessage(error: unknown) {
  if (error instanceof RagError && error.code === 'TIMEOUT' && error.stage === 'session') return '로그인 상태를 확인하는 데 시간이 걸리고 있어요. 연결 상태를 확인하고 다시 시도해 주세요.';
  return ragMessages[error instanceof RagError ? error.code : 'SERVER'] ?? ragMessages.SERVER!;
}
export type RagStatus = 'grounded_answer' | 'local_evidence' | 'insufficient_evidence' | 'emergency' | 'professional' | 'privacy';
export type RagAttribution = { datasetName: string; datasetUrl: string; itemCode: string; termsLabel: string; termsUrl: string; verifiedDetailUrl?: string; detailVerifiedAt?: string };
export type RagSource = { documentId: string; chunkId: string; title: string; quote: string; sourceUrl: string; publisher?: string; updatedAt?: string | null; attribution?: RagAttribution };
// Approved additive contract: grounded_answer requires validated source records.
export type RagReply = { status: RagStatus; message: string; disclaimer: string; sources: RagSource[]; text: string };
export type RagRequestOptions = {
  url?: string; development: boolean; token: () => Promise<string | null>;
  transport?: typeof fetch; timeoutMs?: number; signal?: AbortSignal;
  onStage?: (stage: 'session' | 'http' | 'response') => void;
};
export function safeRagSourceUrl(value: unknown): string {
  try {
    if (typeof value !== 'string' || !value || value.length > 4000) throw Error();
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw Error();
    return url.href;
  } catch { throw new RagError('SERVER'); }
}
export function validateRagBaseUrl(value: string | undefined, development: boolean): URL {
  try {
    const url = new URL(value ?? '');
    // Development Wi-Fi may use RFC 6598 shared space (100.64.0.0/10).
    // HTTP remains rejected in release/web production builds.
    const local = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+)$/.test(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
      || url.protocol !== 'https:' && !(development && local && url.protocol === 'http:')) throw Error();
    return url;
  } catch { throw new RagError('CONFIG'); }
}
export async function requestRagResult(question: string, options: RagRequestOptions): Promise<RagReply> {
  if (typeof question !== 'string' || !question.trim() || question.length > 2000) throw new RagError('INVALID_INPUT');
  const url = validateRagBaseUrl(options.url, options.development);
  if (options.signal?.aborted) throw new RagError('CANCELLED');
  const controller = new AbortController();
  let timedOut = false;
  let stage: 'session' | 'http' | 'response' = 'session';
  const updateStage = (next: typeof stage) => {
    stage = next;
    try { options.onStage?.(next); } catch { /* Presentation must not affect the request. */ }
  };
  const cancel = () => controller.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new RagError(timedOut ? 'TIMEOUT' : 'CANCELLED', stage));
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  try {
    const operation = async () => {
      let token: string | null;
      updateStage('session');
      try { token = await options.token(); } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        const failure = code === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : code === 'RATE_LIMITED' ? 'RATE_LIMITED'
          : code === 'STORAGE' ? 'SESSION_STORAGE' : code === 'CONFIG' ? 'CONFIG' : 'AUTH_UNAVAILABLE';
        throw new RagError(failure, 'session');
      }
      if (!token) throw new RagError('UNAUTHORIZED');
      if (controller.signal.aborted) throw new RagError(timedOut ? 'TIMEOUT' : 'CANCELLED');
      let response: Response;
      updateStage('http');
      try {
        response = await (options.transport ?? fetch)(new URL('/api/rag/chat', url).href, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: question.trim() }), signal: controller.signal, redirect: 'error',
        });
      } catch { throw new RagError(controller.signal.aborted ? timedOut ? 'TIMEOUT' : 'CANCELLED' : 'NETWORK', stage); }
      if (controller.signal.aborted) throw new RagError(timedOut ? 'TIMEOUT' : 'CANCELLED', stage);
      updateStage('response');
      if (response.status === 401 || response.status === 403) throw new RagError('UNAUTHORIZED');
      if (response.status === 429) throw new RagError('RATE_LIMITED');
      if (response.status === 504) throw new RagError('TIMEOUT');
      if (response.status === 503) {
        const failure = await response.json().catch(() => null) as { error?: unknown } | null;
        throw new RagError(failure?.error === 'AUTH_UNAVAILABLE' ? 'AUTH_UNAVAILABLE' : 'SERVER');
      }
      if (!response.ok) throw new RagError(response.status === 400 ? 'INVALID_INPUT' : 'SERVER');
      const data: unknown = await response.json().catch(() => { throw new RagError('RESPONSE'); });
      if (!data || typeof data !== 'object') throw new RagError('SERVER');
      const r = data as { status?: unknown; message?: unknown; disclaimer?: unknown; sources?: unknown };
      if (!['grounded_answer', 'local_evidence', 'insufficient_evidence', 'emergency', 'professional', 'privacy'].includes(String(r.status))
        || typeof r.message !== 'string' || r.message.length > 4000 || typeof r.disclaimer !== 'string'
        || r.disclaimer.length > 1000 || !Array.isArray(r.sources) || r.sources.length > 5) throw new RagError('SERVER');
      const sources: RagSource[] = [];
      const quotes = r.sources.map((s: unknown) => {
        if (!s || typeof s !== 'object') throw new RagError('SERVER');
        const v = s as Record<string, unknown>;
        for (const k of ['documentId', 'chunkId', 'title', 'quote', 'sourceUrl']) {
          if (typeof v[k] !== 'string' || !v[k] || v[k].length > 4000) throw new RagError('SERVER');
        }
        const source = new URL(safeRagSourceUrl(v.sourceUrl));
        if (v.publisher !== undefined && (typeof v.publisher !== 'string' || v.publisher.length > 500)) throw new RagError('SERVER');
        if (v.updatedAt !== undefined && v.updatedAt !== null && (typeof v.updatedAt !== 'string' || !Number.isFinite(Date.parse(v.updatedAt)))) throw new RagError('SERVER');
        const validated: RagSource = { documentId: v.documentId as string, chunkId: v.chunkId as string, title: v.title as string, quote: v.quote as string, sourceUrl: source.href,
          ...(v.publisher !== undefined ? { publisher: v.publisher as string } : {}), ...(v.updatedAt !== undefined ? { updatedAt: v.updatedAt as string | null } : {}) };
        if (v.attribution !== undefined) {
          if (!v.attribution || typeof v.attribution !== 'object' || Array.isArray(v.attribution)) throw new RagError('SERVER');
          const a = v.attribution as Record<string, unknown>;
          for (const k of ['datasetName', 'datasetUrl', 'itemCode', 'termsLabel', 'termsUrl']) {
            if (typeof a[k] !== 'string' || !a[k] || a[k].length > 2000) throw new RagError('SERVER');
          }
          const checkLink = (value: unknown) => {
            if (typeof value !== 'string' || value.length > 2000) throw new RagError('SERVER');
            return safeRagSourceUrl(value);
          };
          const datasetLink = checkLink(a.datasetUrl), termsLink = checkLink(a.termsUrl);
          if (datasetLink !== source.href || typeof v.publisher !== 'string' || !v.publisher) throw new RagError('SERVER');
          let detail = '';
          validated.attribution = { datasetName: a.datasetName as string, datasetUrl: datasetLink, itemCode: a.itemCode as string, termsLabel: a.termsLabel as string, termsUrl: termsLink };
          if (a.verifiedDetailUrl !== undefined || a.detailVerifiedAt !== undefined) {
            if (typeof a.detailVerifiedAt !== 'string' || !Number.isFinite(Date.parse(a.detailVerifiedAt))) throw new RagError('SERVER');
            validated.attribution.verifiedDetailUrl = checkLink(a.verifiedDetailUrl);
            validated.attribution.detailVerifiedAt = a.detailVerifiedAt;
            detail = `\n검증된 상세페이지: ${validated.attribution.verifiedDetailUrl}\n상세 링크 확인일: ${a.detailVerifiedAt}`;
          }
          sources.push(validated);
          return `${v.quote}\n출처: ${v.title} [${v.documentId}]\n근거 ID: ${v.chunkId}\n제공기관: ${v.publisher}\n데이터셋명: ${a.datasetName}\n품목기준코드: ${a.itemCode}\n원본 갱신일: ${v.updatedAt ?? '미확인'}\n이용 조건: ${a.termsLabel}\n이용 조건 근거: ${termsLink}\n공식 데이터셋 링크: ${datasetLink}${detail}`;
        }
        sources.push(validated);
        const details = [v.publisher, v.updatedAt ? `갱신일: ${v.updatedAt}` : null].filter(Boolean).join(' · ');
        return `${v.quote}\n출처: ${v.title} [${v.documentId}]\n근거 ID: ${v.chunkId}${details ? `\n${details}` : ''}\n${v.sourceUrl}`;
      });
      if (['local_evidence', 'grounded_answer'].includes(String(r.status)) && !quotes.length) throw new RagError('SERVER');
      return { status: r.status as RagStatus, message: r.message, disclaimer: r.disclaimer, sources, text: [r.message, ...quotes, r.disclaimer].join('\n\n') };
    };
    timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 12000);
    return await Promise.race([operation(), aborted]);
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); controller.signal.removeEventListener('abort', onAbort); }
}
// Keep the established text API for existing consumers and regression tests.
export async function requestRag(question: string, options: RagRequestOptions): Promise<string> {
  return (await requestRagResult(question, options)).text;
}
