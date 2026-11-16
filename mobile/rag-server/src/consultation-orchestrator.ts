import { questionCandidates, type ConsultationSession } from './consultation-session.js';
import { existingSafetyGuard, type ConsultationSafetyGuard } from './consultation-safety.js';
import { requestQuestion, validateQuestion, type ConsultationProvider, type QuestionRequest } from './consultation-provider.js';
import type { ConsultationRetriever, EvidenceReply } from './consultation-retriever.js';
import type { ConsultationRules } from './consultation-rules.js';

export type ConsultationDependencies = {
  rules: ConsultationRules;
  retriever: ConsultationRetriever;
  provider?: ConsultationProvider;
  additionalSafetyGuard?: ConsultationSafetyGuard;
  allowTestProvider?: boolean;
  // Future authenticated server-owned authorization, consent and minimization.
  // Defaults never permit external transmission. Not a client request flag.
  externalPolicy?: { approved: boolean; consentValid(sessionId: string): boolean; minimize(input: QuestionRequest): QuestionRequest };
  timeoutMs?: number;
};
export async function advanceConsultation(session: ConsultationSession, deps: ConsultationDependencies, signal: AbortSignal) {
  if (signal.aborted) throw Error('CANCELLED');
  const safety = existingSafetyGuard(deps.rules).check(session) ?? deps.additionalSafetyGuard?.check(session);
  if (safety) return { kind: 'safety' as const, session: { ...session, closed: true, pending: null }, safety };
  // Pause/resume/re-render must not run retrieval or providers twice.
  if (session.closed || session.pending) return { kind: 'unchanged' as const, session };
  const candidates = questionCandidates(session, deps.rules);
  if (candidates.length) {
    let question = candidates[0]!;
    let mode: 'rules' | 'provider' = 'rules';
    let providerState: 'disabled' | 'accepted' | 'fallback' = 'disabled';
    const request: QuestionRequest = { symptoms: session.initialInput, answers: session.answers.map(a => ({ topic: a.key, text: a.text })), candidates };
    const provider = deps.provider;
    const allowed = provider && (provider.kind === 'test-only' ? deps.allowTestProvider === true
      : deps.externalPolicy?.approved === true && deps.externalPolicy.consentValid(session.id));
    if (provider && allowed) {
      try {
        const minimized = provider.kind === 'external' ? deps.externalPolicy!.minimize(structuredClone(request)) : request;
        // Provider cannot add topics/options via a minimizer; validate against
        // the original candidates as well, and never include retrieved documents.
        const chosen = await requestQuestion(provider, minimized, signal, deps.timeoutMs);
        question = validateQuestion({ topic: chosen.topic, text: chosen.text }, request);
        mode = 'provider'; providerState = 'accepted';
      } catch { if (signal.aborted) throw Error('CANCELLED'); providerState = 'fallback'; }
    }
    return { kind: 'question' as const, session: { ...session, pending: question.topic }, question, mode, providerState };
  }
  let evidence: EvidenceReply | null = null;
  let retrieval: 'ok' | 'unavailable' = 'ok';
  try { evidence = await deps.retriever.retrieve(session.initialInput, signal); }
  catch { if (signal.aborted) throw Error('CANCELLED'); retrieval = 'unavailable'; }
  if (signal.aborted) throw Error('CANCELLED');
  // No generated medical explanation: exact existing search payload or abstention.
  return { kind: 'summary' as const, session: { ...session, closed: true },
    reported: { initialInput: session.initialInput, answers: structuredClone(session.answers) },
    retrieval, evidence, notice: '사용자가 답한 내용이며 진단 결과가 아닙니다. 공식 자료가 부족하면 원인이나 치료법을 추측하지 않습니다.' };
}
