import type { QuestionKey } from './consultation-rules.js';

// This module has no implementation that contacts a provider, model or network.
// Only minimized user input may enter this DTO. No JWT, identity or evidence text.
export type QuestionRequest = {
  symptoms: string;
  answers: { topic: QuestionKey; text: string }[];
  candidates: { topic: QuestionKey; text: string; options: string[] }[];
};
export interface ConsultationProvider {
  readonly kind: 'external' | 'test-only';
  proposeQuestion(input: QuestionRequest, signal: AbortSignal): Promise<unknown>;
}
export function validateQuestion(raw: unknown, request: QuestionRequest) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('INVALID_PROVIDER_RESPONSE');
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some(k => !['topic', 'text'].includes(k))) throw Error('INVALID_PROVIDER_RESPONSE');
  const question = request.candidates.find(c => c.topic === value.topic);
  // Initial foundation permits catalog selection only. Arbitrary clinical prose,
  // diagnoses, instructions, new options and already supplied topics fail closed.
  if (!question || value.text !== question.text) throw Error('INVALID_PROVIDER_RESPONSE');
  return question;
}
export async function requestQuestion(provider: ConsultationProvider, input: QuestionRequest, signal: AbortSignal, timeoutMs = 1500) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw Error('INVALID_TIMEOUT');
  if (signal.aborted) throw Error('CANCELLED');
  // Runtime allowlist too: an adapter/minimizer must not forward extra fields.
  const outbound: QuestionRequest = {
    symptoms: input.symptoms,
    answers: input.answers.map(a => ({ topic: a.topic, text: a.text })),
    candidates: input.candidates.map(c => ({ topic: c.topic, text: c.text, options: [...c.options] })),
  };
  if (typeof outbound.symptoms !== 'string' || outbound.symptoms.length > 2000 || outbound.answers.length > 4 || outbound.candidates.length > 5
    || outbound.answers.some(a => typeof a.text !== 'string' || a.text.length > 2000)) throw Error('INVALID_PROVIDER_INPUT');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: (error: Error) => void = () => {};
  const abort = () => { controller.abort(); rejectAbort(Error('CANCELLED')); };
  const cancelled = new Promise<never>((_, reject) => { rejectAbort = reject; });
  signal.addEventListener('abort', abort, { once: true });
  try {
    return validateQuestion(await Promise.race([
      Promise.resolve().then(() => provider.proposeQuestion(structuredClone(outbound), controller.signal)),
      cancelled,
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('PROVIDER_TIMEOUT')); }, timeoutMs); }),
    ]), input);
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}
