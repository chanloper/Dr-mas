// DUR pagination has a bounded 40s server deadline. No other API gets a longer
// transport deadline, including similarly named paths or other project origins.
export const DUR_TRANSPORT_TIMEOUT_MS = 45000;
export const DUR_OPERATION_TIMEOUT_MS = 50000;
export function supabaseRequestTimeout(input: RequestInfo | URL, init: RequestInit | undefined, projectOrigin: string): number {
  try {
    const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input));
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    if (url.origin === projectOrigin && url.pathname === '/functions/v1/check-dur' && method === 'POST') return DUR_TRANSPORT_TIMEOUT_MS;
  } catch { /* Preserve the ordinary deadline for malformed/unknown targets. */ }
  return 15000;
}
