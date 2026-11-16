import { randomUUID } from 'node:crypto';
import type { ConsultationRules, ConsultationAnswer, QuestionKey } from './consultation-rules.js';

// Server-owned, transient state. Never accept a client-supplied session as authority.
export type ConsultationSession = {
  id: string; initialInput: string; answers: ConsultationAnswer[];
  pending: QuestionKey | null; closed: boolean;
};
export function startConsultation(input: string): ConsultationSession {
  validateInput(input);
  return { id: randomUUID(), initialInput: input.trim(), answers: [], pending: null, closed: false };
}
function validateInput(input: string) {
  if (!input.trim() || input.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(input)) throw Error('INVALID_INPUT');
}
export function recordAnswer(session: ConsultationSession, topic: QuestionKey, text: string): ConsultationSession {
  validateInput(text);
  if (session.closed || session.pending !== topic || session.answers.some(a => a.key === topic)) throw Error('STALE_ANSWER');
  return { ...session, answers: [...session.answers, { key: topic, text: text.trim() }], pending: null };
}
export function questionCandidates(session: ConsultationSession, rules: ConsultationRules) {
  if (session.closed || session.answers.length >= 4) return [];
  const supplied = [...session.answers];
  const text = [session.initialInput, ...supplied.map(a => a.text)].join(' ');
  // Explicit numeric intensity is a supplied fact, never a diagnostic inference.
  if (/(?:10\s*점\s*중\s*)?\d{1,2}\s*점/u.test(text) && !supplied.some(a => a.key === 'severity')) supplied.push({ key: 'severity', text: '수치로 답변함' });
  const catalog = rules.consultationQuestions(session.initialInput);
  const candidates: { topic: QuestionKey; text: string; options: string[] }[] = [];
  while (supplied.length < 4) {
    const topic = rules.nextConsultationQuestion(session.initialInput, supplied);
    if (!topic) break;
    candidates.push({ topic, text: catalog[topic].question, options: [...catalog[topic].options] });
    supplied.push({ key: topic, text: '' });
  }
  return candidates;
}
