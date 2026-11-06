import { readToken } from './auth';
import { requestRagResult, validateRagBaseUrl } from './ragClient';
export { ragErrorMessage } from './ragClient';
export function ragConfigured(): boolean {
  try { validateRagBaseUrl(process.env.EXPO_PUBLIC_RAG_API_URL, __DEV__); return true; } catch { return false; }
}
export function sendRagChat(question: string, options: { signal?: AbortSignal } = {}) {
  return requestRagResult(question, {
    url: process.env.EXPO_PUBLIC_RAG_API_URL,
    development: __DEV__, token: readToken, signal: options.signal,
  });
}
