import { routeSafety, safetyMessages } from './answer.js';
import type { ConsultationRules } from './consultation-rules.js';
import type { ConsultationSession } from './consultation-session.js';

export type SafetyDecision = { status: 'emergency' | 'privacy' | 'professional'; message: string } | null;
export interface ConsultationSafetyGuard { check(session: ConsultationSession): SafetyDecision }
// Reuse existing independent safety rules; this is not comprehensive triage.
export function existingSafetyGuard(rules: ConsultationRules): ConsultationSafetyGuard { return {
  check(session) {
    const texts = [session.initialInput, ...session.answers.map(a => a.text)];
    const catalog = rules.consultationQuestions(session.initialInput);
    if (texts.some(t => rules.explicitEmergency(t) || routeSafety(t) === 'emergency') || session.answers.some(a =>
      rules.answerIsEmergency(a.key, catalog[a.key].options.indexOf(a.text), a.text))) {
      return { status: 'emergency', message: safetyMessages.emergency };
    }
    for (const text of texts) {
      const status = routeSafety(text);
      if (status) return { status, message: safetyMessages[status] };
    }
    return null;
  },
}; }
