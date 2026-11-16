export type RagClientStage = 'session' | 'http' | 'response';
type Event = 'start' | 'stage' | 'success' | 'error';
const statuses = new Set(['local_evidence', 'grounded_answer', 'insufficient_evidence', 'emergency', 'professional', 'privacy']);
const codes = new Set(['UNAUTHORIZED', 'NETWORK', 'SESSION_STORAGE', 'TIMEOUT', 'AUTH_UNAVAILABLE', 'RESPONSE', 'RATE_LIMITED', 'CONFIG', 'INVALID_INPUT', 'SERVER', 'CANCELLED']);

// Closed vocabularies only. Never serialize questions, headers, tokens, source
// text, user IDs, endpoint URLs, raw errors or their messages/causes.
export function safeRagDiagnostic(event: Event, stage: RagClientStage, elapsedMs: number, result?: unknown, error?: unknown) {
  const reply = result as { status?: unknown; sources?: unknown } | null;
  const failure = error as { code?: unknown } | null;
  return {
    event, stage,
    elapsedMs: Number.isFinite(elapsedMs) ? Math.max(0, Math.min(86400000, Math.round(elapsedMs))) : null,
    status: typeof reply?.status === 'string' && statuses.has(reply.status) ? reply.status : null,
    sourceCount: Array.isArray(reply?.sources) && reply.sources.length <= 5 ? reply.sources.length : null,
    code: event === 'error' ? typeof failure?.code === 'string' && codes.has(failure.code) ? failure.code : 'UNRECOGNIZED' : null,
  };
}

export function logRagDiagnostic(event: Event, stage: RagClientStage, elapsedMs: number, result?: unknown, error?: unknown): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  try { console.info('[DrMAS RAG]', JSON.stringify(safeRagDiagnostic(event, stage, elapsedMs, result, error))); }
  catch { /* Logging must never change request handling. */ }
}
