// Boundary for the existing pure consultationFlow functions. Inject them from
// an approved host adapter; do not couple the server build to Expo source roots.
export type QuestionKey = 'nausea' | 'fever' | 'onset' | 'severity' | 'associated';
export type ConsultationAnswer = { key: QuestionKey; text: string };
export interface ConsultationRules {
  consultationQuestions(input: string): Record<QuestionKey, { question: string; options: string[] }>;
  nextConsultationQuestion(input: string, answers: ConsultationAnswer[]): QuestionKey | null;
  explicitEmergency(input: string): boolean;
  answerIsEmergency(key: QuestionKey, index: number, text: string): boolean;
}
