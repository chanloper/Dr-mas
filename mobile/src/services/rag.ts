import { readToken } from './auth';
import { requestRagResult, validateRagBaseUrl, type RagRequestOptions } from './ragClient';
import { logRagDiagnostic, type RagClientStage } from './ragDiagnostics';
import { withHeadacheMedicines } from './headacheMedicines';
import { fetchHeadacheMedicines } from './prescriptionAnalysis';
export { ragErrorMessage } from './ragClient';
export function ragConfigured(): boolean {
  try { validateRagBaseUrl(process.env.EXPO_PUBLIC_RAG_API_URL, __DEV__); return true; } catch { return false; }
}
// Public endpoint only, development UI only. Never include headers or session data.
export function ragDevelopmentEndpoint(): string | null {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return null;
  try { return `POST ${new URL('/api/rag/chat', validateRagBaseUrl(process.env.EXPO_PUBLIC_RAG_API_URL, true)).href}`; }
  catch { return null; }
}
export async function sendRagChat(question: string, options: Pick<RagRequestOptions, 'signal' | 'onStage'> = {}) {
  const started = Date.now();
  let stage: RagClientStage = 'session';
  logRagDiagnostic('start', stage, 0);
  try {
    const reply = await requestRagResult(question, {
      url: process.env.EXPO_PUBLIC_RAG_API_URL,
      development: __DEV__, token: readToken, signal: options.signal, onStage: next => {
        stage = next; logRagDiagnostic('stage', stage, Date.now() - started); options.onStage?.(next);
      },
    });
    const result=await withHeadacheMedicines(reply,question,fetchHeadacheMedicines,options.signal);
    logRagDiagnostic('success', stage, Date.now() - started, result);
    return result;
  } catch (error) {
    logRagDiagnostic('error', stage, Date.now() - started, undefined, error);
    throw error;
  }
}
