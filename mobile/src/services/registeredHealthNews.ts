import { readToken } from './auth';
import { validateRagBaseUrl } from './ragClient';
import { reviewedHealthNews, type HealthNewsItem } from './healthNews';

// Only the existing authenticated Dr.MAS server is contacted. Never the KDCA API.
export async function loadRegisteredHealthNews(signal: AbortSignal): Promise<HealthNewsItem[]> {
  const url = new URL('/api/rag/health-info', validateRagBaseUrl(process.env.EXPO_PUBLIC_RAG_API_URL, __DEV__));
  const controller = new AbortController();
  let rejectAbort: (error: Error) => void = () => {};
  const cancelled = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = () => { controller.abort(); rejectAbort(Error('CANCELLED')); };
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 8000);
  try {
    if (signal.aborted) throw Error('CANCELLED');
    const run = async () => {
    const token = await readToken();
    if (!token || controller.signal.aborted) throw Error('UNAVAILABLE');
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}', signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw Error('UNAVAILABLE');
    const result = await response.json() as { items?: unknown };
    if (!Array.isArray(result.items) || result.items.length > 1000) throw Error('INVALID_RESPONSE');
    // Home payloads must carry the server's bounded validity, not just a flag.
    return reviewedHealthNews(result.items.filter(item => item && typeof item === 'object' && typeof item.validUntil === 'string'));
    };
    return await Promise.race([run(), cancelled]);
  } catch { throw Error('HEALTH_NEWS_UNAVAILABLE'); }
  finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}
