export class RagError extends Error {
  constructor(public code: string) { super(code); }
}
export const ragMessages: Record<string, string> = {
  UNAUTHORIZED: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  NETWORK: 'RAG 서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.',
  TIMEOUT: '응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
  RATE_LIMITED: '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
  CONFIG: 'RAG 서버 주소가 설정되지 않았거나 올바르지 않습니다.',
  INVALID_INPUT: '질문은 1~2000자로 입력해 주세요.',
  SERVER: 'RAG 서버에서 요청을 처리하지 못했습니다.',
};
export function ragErrorMessage(error: unknown) {
  return ragMessages[error instanceof RagError ? error.code : 'SERVER'] ?? ragMessages.SERVER!;
}
export async function requestRag(question: string, options: {
  url?: string; development: boolean; token: () => Promise<string | null>;
  transport?: typeof fetch; timeoutMs?: number;
}): Promise<string> {
  if (!question.trim() || question.length > 2000) throw new RagError('INVALID_INPUT');
  let url: URL;
  try {
    url = new URL(options.url ?? '');
    const local = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
      || url.protocol !== 'https:' && !(options.development && local && url.protocol === 'http:')) throw Error();
  } catch { throw new RagError('CONFIG'); }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const operation = async () => {
      let token: string | null;
      try { token = await options.token(); } catch { throw new RagError('UNAUTHORIZED'); }
      if (!token) throw new RagError('UNAUTHORIZED');
      if (controller.signal.aborted) throw new RagError('TIMEOUT');
      let response: Response;
      try {
        response = await (options.transport ?? fetch)(new URL('/api/rag/chat', url).href, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: question.trim() }), signal: controller.signal, redirect: 'error',
        });
      } catch { throw new RagError(controller.signal.aborted ? 'TIMEOUT' : 'NETWORK'); }
      if (response.status === 401 || response.status === 403) throw new RagError('UNAUTHORIZED');
      if (response.status === 429) throw new RagError('RATE_LIMITED');
      if (response.status === 504) throw new RagError('TIMEOUT');
      if (!response.ok) throw new RagError(response.status === 400 ? 'INVALID_INPUT' : 'SERVER');
      const data: unknown = await response.json().catch(() => { throw new RagError('SERVER'); });
      if (!data || typeof data !== 'object') throw new RagError('SERVER');
      const r = data as { status?: unknown; message?: unknown; disclaimer?: unknown; sources?: unknown };
      if (!['local_evidence', 'insufficient_evidence', 'emergency', 'professional', 'privacy'].includes(String(r.status))
        || typeof r.message !== 'string' || r.message.length > 4000 || typeof r.disclaimer !== 'string'
        || r.disclaimer.length > 1000 || !Array.isArray(r.sources) || r.sources.length > 5) throw new RagError('SERVER');
      const quotes = r.sources.map((s: unknown) => {
        if (!s || typeof s !== 'object') throw new RagError('SERVER');
        const v = s as Record<string, unknown>;
        for (const k of ['documentId', 'chunkId', 'title', 'quote', 'sourceUrl']) {
          if (typeof v[k] !== 'string' || !v[k] || v[k].length > 4000) throw new RagError('SERVER');
        }
        const source = new URL(v.sourceUrl as string);
        if (source.protocol !== 'https:' || source.username || source.password) throw new RagError('SERVER');
        if (v.publisher !== undefined && (typeof v.publisher !== 'string' || v.publisher.length > 500)) throw new RagError('SERVER');
        if (v.updatedAt !== undefined && v.updatedAt !== null && (typeof v.updatedAt !== 'string' || !Number.isFinite(Date.parse(v.updatedAt)))) throw new RagError('SERVER');
        const details = [v.publisher, v.updatedAt ? `갱신일: ${v.updatedAt}` : null].filter(Boolean).join(' · ');
        return `${v.quote}\n출처: ${v.title} [${v.documentId}]\n근거 ID: ${v.chunkId}${details ? `\n${details}` : ''}\n${v.sourceUrl}`;
      });
      if (r.status === 'local_evidence' && !quotes.length) throw new RagError('SERVER');
      return [r.message, ...quotes, r.disclaimer].join('\n\n');
    };
    return await Promise.race([operation(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new RagError('TIMEOUT')); }, options.timeoutMs ?? 12000);
    })]);
  } finally { clearTimeout(timer); }
}
