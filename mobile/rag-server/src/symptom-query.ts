// Literal symptom vocabulary only. No disease inference or generated medical facts.
export function symptomSubjects(question: string): string[] {
  const initial = question.split('\n[문진 답변]\n')[0]!.split('\n추가 질문:')[0]!;
  // Time expressions and conversational prefixes must not bypass the disease
  // evidence filter. Inspect only the initial input, not interview option labels.
  return [ /머리(?:가|도|는|에|\s)|두통/u.test(initial) && '두통', /배(?:가|도|는|에|\s)|복통/u.test(initial) && '복통', /기침/u.test(initial) && '기침' ].filter((value): value is string => Boolean(value));
}
