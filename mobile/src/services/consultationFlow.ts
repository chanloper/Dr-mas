// Local input support, not diagnosis, evidence retrieval or generated advice.
export type QuestionKey = 'nausea' | 'fever' | 'onset' | 'severity' | 'associated';
export type ConsultationAnswer = { key: QuestionKey; text: string; freeText?: boolean };
export type ConsultationInputHandler = (text: string) => 'accepted' | 'rejected';
const answerMarker = '\n[문진 답변]\n';
export function hasConsultationAnswers(question: string): boolean { return question.includes(answerMarker); }
// The request retains structured context; the chat shows only the user's turn.
export function consultationDisplayQuestion(question: string): string {
  const followup = '\n추가 질문: ';
  const index = question.lastIndexOf(followup);
  if (index >= 0) return question.slice(index + followup.length);
  return question.split(answerMarker)[0].split('\n[추가 입력]\n')[0];
}
export function consultationSearchQuestion(question: string, answers: ConsultationAnswer[]): string {
  const catalog = consultationQuestions(question);
  // Free text is an explicitly submitted answer, never an inferred clinical fact.
  const selected = answers.filter((answer, index) => Object.hasOwn(catalog, answer.key)
    && (catalog[answer.key].options.includes(answer.text) || answer.freeText === true && typeof answer.text === 'string' && answer.text.trim().length > 0 && answer.text.length <= 300)
    && answers.findIndex(item => item.key === answer.key) === index).slice(0, 4);
  if (!selected.length) return question;
  // Do not send unanswered red-flag questions as if the user reported them.
  const labels: Record<QuestionKey, string> = { nausea: '메스꺼움', fever: '발열', onset: '시작 시점', severity: '불편한 정도', associated: '동반 증상' };
  const query = question + answerMarker + selected.map(answer => `${labels[answer.key]}: ${answer.text}`).join('\n');
  return query.length <= 2000 ? query : question;
}
export function followupSearchQuestion(question: string, previous?: string): string {
  if (!previous || !isSymptomInput(previous) || explicitEmergency(question)) return question;
  const subjects = (text: string) => [/머리|두통/.test(text) && 'head', /배(?:가|도|는|에|\s)|복통/.test(text) && 'abdomen', /기침/.test(text) && 'cough'].filter(Boolean);
  const before = subjects(previous.split(answerMarker)[0]), current = subjects(question);
  if (current.some(subject => !before.includes(subject))) return question;
  const refersBack = /이럴\s*때|이런\s*경우|그럼|그러면|이\s*증상|그\s*증상|왜|어떤\s*질환|어느\s*진료과|집에서|더\s*심해지|다른\s*증상/u.test(question)
    || !current.length && /어떻게\s*(?:관리|대처|해야)|관리(?:해야|하나요|하면)|대처(?:해야|하나요|하면)/u.test(question);
  const sameTopicQuestion = current.length > 0 && /원인|이유|왜|병원|어떻게/u.test(question);
  const additionalAnswer = !current.length && /메스|구토|울렁|열이|발열|오늘|어제|며칠|\d+\s*점/u.test(question);
  if (!refersBack && !sameTopicQuestion && !additionalAnswer) return question;
  const query = `${previous}\n추가 질문: ${question}`;
  return query.length <= 2000 ? query : question;
}
export function consultationSummary(question: string, answers: ConsultationAnswer[]): string {
  const values = answers.map(answer => {
    if (answer.freeText) return `추가로 “${answer.text}”라고 말씀하셨어요`;
    const prefix: Record<QuestionKey, string> = { onset: '시작 시점은', severity: '불편한 정도는', nausea: '메스꺼움은', fever: '열이 나는 느낌은', associated: '추가 증상은' };
    return `${prefix[answer.key]} “${answer.text}”라고 답하셨어요`;
  });
  return `“${consultationDisplayQuestion(question)}”라고 말씀하셨어요. ${values.join('. ')}.\n\n여기까지는 사용자가 답한 내용이며 진단 결과가 아니에요. 검색 결과와 공식 출처를 이어서 확인해 주세요. 위험 신호가 없다는 답변만으로 안전하다고 판단할 수는 없어요.`;
}
export function isSymptomInput(input: string): boolean {
  return /머리|두통|배가|복통|기침|아파|아프|통증|불편|메스|울렁|어지|구역|열이|발열/.test(input);
}
export function symptomLabel(input: string): string {
  const labels = [/머리|두통/.test(input) && '머리 통증', /배(?:가|도|는|에|\s)|복통/.test(input) && '배의 불편함', /기침/.test(input) && '기침'].filter(Boolean);
  return labels.length ? labels.join('과 ') : '몸의 불편함';
}
export function explicitEmergency(input: string): boolean {
  // Keep explicit danger separate from retrieval. This is not exhaustive and
  // absence of these phrases must never be interpreted as "safe".
  return /말(?:이)?\s*(?:어눌|안\s*나)|언어\s*장애|(?:팔다리|한쪽|팔|다리).{0,12}(?:힘이?\s*(?:없|빠)|마비)|시야\s*이상|시각\s*장애|앞이\s*안\s*보|숨(?:을)?\s*못\s*쉬|숨\s*쉬기(?:가)?\s*(?:어려|힘들)|호흡곤란|의식(?:이)?\s*(?:없|흐려|잃)|갑자기.{0,16}(?:극심|매우\s*심)|가슴.{0,8}(?:통증|아파)|견딜\s*수\s*없|못\s*견디|열이.{0,12}목이?\s*뻣뻣/u.test(input);
}
export function consultationQuestions(input: string) {
  const head = /머리|두통/.test(input);
  return {
    nausea: { question: head ? '머리가 아프면서 메스껍거나 토할 것 같은 느낌도 있으신가요?' : '속이 메스껍거나 토할 것 같은 느낌도 있으신가요?', options: ['네, 있어요', '아니요, 없어요', '잘 모르겠어요'] },
    fever: { question: '기침과 함께 열이 나는 느낌도 있으신가요?', options: ['네, 있어요', '아니요, 없어요', '잘 모르겠어요'] },
    onset: { question: head ? '머리가 언제부터 아팠나요?' : '말씀하신 불편함은 언제부터 있었나요?', options: ['오늘 시작됐어요', '며칠 전부터 또는 반복해서 아파요', '갑자기 시작해 바로 매우 심해졌어요', '잘 모르겠어요'] },
    severity: { question: '얼마나 불편한가요?', options: ['가벼워요', '일상생활이 불편해요', '견디기 어려울 만큼 심해요', '잘 모르겠어요'] },
    associated: { question: '새로 나타난 다음 증상이 있나요?', options: head
      ? ['말이 어눌하거나 팔다리에 힘이 없거나 앞이 안 보여요', '열이 나면서 목이 뻣뻣해요', '해당 증상은 없어요', '잘 모르겠어요']
      : ['숨쉬기 어렵거나 의식이 흐려요', '가슴 통증이 있어요', '해당 증상은 없어요', '잘 모르겠어요'] },
  };
}
export function nextConsultationQuestion(input: string, answers: ConsultationAnswer[]): QuestionKey | null {
  if (answers.length >= 4) return null;
  const supplied = new Set<QuestionKey>(answers.map(answer => answer.key));
  // Only skip topics explicitly mentioned; do not infer a disease or an answer.
  const text = [input, ...answers.map(answer => answer.text)].join(' ');
  if (/메스껍|메스꺼|울렁|구토|토할/.test(text)) supplied.add('nausea');
  if (/오늘|어제|어젯밤|며칠|일주일|지난주|방금|\d+\s*(?:일|시간|주)\s*전/.test(text)) supplied.add('onset');
  if (/조금|가벼|심하|극심|견디|일상생활|\d+\s*점/.test(text)) supplied.add('severity');
  if (/열(?:이|은|도)|발열/.test(text)) supplied.add('fever');
  const first: QuestionKey = /기침/.test(input) && !/머리|두통|배(?:가|도|는|에|\s)|복통/.test(input) ? 'fever' : 'nausea';
  const no = answers.some(answer => (answer.key === 'nausea' || answer.key === 'fever')
    && (answer.text === '아니요, 없어요' || /^없(?:어요|습니다)[.! ]*$/.test(answer.text)));
  const order: QuestionKey[] = no ? [first, 'severity', 'onset', 'associated'] : [first, 'onset', 'severity', 'associated'];
  return order.find(key => !supplied.has(key)) ?? null;
}
export function answerIsEmergency(key: QuestionKey, index: number, text: string): boolean {
  return key === 'onset' && index === 2 || key === 'severity' && index === 2 || key === 'associated' && index >= 0 && index < 2 || explicitEmergency(text);
}

// Lexical input support only. An additional symptom is not an answer to an
// unrelated pending question, and an unrecognized phrase is never a negative.
export function isAdditionalSymptom(text: string, pending: QuestionKey): boolean {
  const supplied: Record<QuestionKey, RegExp> = {
    nausea: /메스|구토|토할|울렁|^(?:네|아니|없|잘\s*모르)/u,
    fever: /열|발열|체온|\d+\s*도|^(?:네|아니|없|잘\s*모르)/u,
    onset: /오늘|어제|어젯밤|며칠|지난|방금|부터|시작|\d+\s*(?:일|시간|주)/u,
    severity: /조금|가벼|심|견디|일상|\d+\s*점/u,
    associated: /./u,
  };
  const otherFact = isSymptomInput(text) || /오늘|어제|어젯밤|며칠|지난|방금|부터|시작|\d+\s*(?:일|시간|주|점)/u.test(text);
  return otherFact && !supplied[pending].test(text);
}

export function consultationQuestionLead(key: QuestionKey): string {
  return {
    nausea: '함께 느끼는 불편함도 빠뜨리지 않도록 여쭤볼게요.',
    fever: '기침 외에 말씀하실 불편함이 있는지도 함께 정리할게요.',
    onset: '검색할 때 참고할 수 있도록 시작 시점을 확인할게요.',
    severity: '얼마나 불편한지 말씀하신 그대로 기록할게요.',
    associated: '마지막으로 함께 나타난 증상을 확인할게요. 모르면 모른다고 답해 주세요.',
  }[key];
}
