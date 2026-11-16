import { useEffect, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { ChatMessage } from './ChatMessage';
import { Action, s } from './ui';
import { EmergencyCallButton } from './EmergencyCallButton';
import { emergencyGuidance } from '../services/emergencyGuidance';
import { consultationSummary } from '../services/consultationFlow';
import type { InterviewSnapshot } from '../services/consultationHistory';

import { answerIsEmergency, consultationQuestionLead, consultationQuestions, consultationSearchQuestion, explicitEmergency, isAdditionalSymptom, nextConsultationQuestion, symptomLabel, type ConsultationAnswer as Answer, type ConsultationInputHandler, type QuestionKey } from '../services/consultationFlow';

type Turn = { question?: string; text: string; freeText?: boolean };
type Interview = InterviewSnapshot;
// Preserve answers if Fast Refresh retains the pre-update state shape.
function interviewTurns(current: Interview, question: string): Turn[] {
  return current.turns ?? current.answers.map(item => ({
    question: consultationQuestions(question)[item.key].question, text: item.text, freeText: item.freeText,
  }));
}
export function HeadacheConversation({ question, active, followup = false, collectBeforeSearch = false, searchOnComplete = false, onSearch, onHospital, onRestart, onAdvance, onEmergency, searchDisabled, inputHandlerRef, savedState, onStateChange }: {
  question: string; active: boolean; followup?: boolean; collectBeforeSearch?: boolean; searchOnComplete?: boolean; onSearch: (query?: string) => void; onHospital: () => void; onRestart: () => void; onAdvance: () => void; onEmergency: (urgent: boolean, reported?: string, context?: string) => void; searchDisabled: boolean;
  savedState?: InterviewSnapshot; onStateChange?: (state: InterviewSnapshot) => void;
  inputHandlerRef?: { current: ConsultationInputHandler | null };
}) {
  const initialUrgent = explicitEmergency(question);
  const [state, setState] = useState<Interview>(savedState ?? { checked: followup || initialUrgent, answers: [], turns: [], urgent: initialUrgent, riskText: initialUrgent ? question : undefined });
  useEffect(() => { onStateChange?.(state); }, [state, onStateChange]);
  const contextFor = (current: Interview) => {
    const supplied = interviewTurns(current, question).filter(turn => turn.freeText).map(turn => turn.text);
    return supplied.length ? `${question}\n[추가 입력]\n${supplied.join('\n')}` : question;
  };
  const context = contextFor(state);
  const head = /\uBA38\uB9AC|\uB450\uD1B5/.test(context);
  const questions = consultationQuestions(context);
  if (head) questions.severity.question = '얼마나 아픈가요?';
  const nextQuestion = (answers: Answer[]) => nextConsultationQuestion(context, answers);
  const checkedOnce = useRef(savedState?.checked ?? followup);
  const evidenceRequested = useRef(savedState?.searchRequested === true);
  const inputBusy = useRef(false);
  const [paused, setPaused] = useState(false);
  const [inputNotice, setInputNotice] = useState('');
  useEffect(() => { if (state.urgent) onEmergency(true, state.riskText ?? state.riskAnswer ?? question, question); }, [state.urgent, state.riskText, state.riskAnswer, question, onEmergency]);
  const bubble = (text: string, sender: 'user' | 'assistant' = 'assistant') => <ChatMessage message={{ id: 0, sender, text }} onEvidence={() => {}} />;
  const check = (urgent: boolean, checkAnswer?: string) => {
    if (!active || paused || checkedOnce.current) return;
    checkedOnce.current = true;
    onAdvance();
    setState(current => current.checked ? current : { ...current, checked: true, urgent,
      checkAnswer: checkAnswer ?? (urgent ? '해당하거나 판단하기 어려워요' : '해당 없어요'),
      riskText: urgent ? checkAnswer ?? '해당하거나 판단하기 어려워요' : current.riskText });
    if (!urgent && !collectBeforeSearch) onSearch();
  };
  const answer = (step: number, key: QuestionKey, option: string, index: number) => {
    if (!active || paused) return;
    if (state.urgent || state.answers.length !== step || nextQuestion(state.answers) !== key) return;
    // Notify immediately in the same event; no effect, search or network is
    // needed to stop ordinary counseling when a later answer reveals danger.
    if (answerIsEmergency(key, index, option)) onEmergency(true, option, question);
    onAdvance();
    setState(current => {
      if (!current.checked || current.urgent || current.answers.length !== step) return current;
      if (nextQuestion(current.answers) !== key) return current;
      const urgent = answerIsEmergency(key, index, option);
      return { ...current, answers: [...current.answers, { key, text: option }], turns: [...interviewTurns(current, question), { question: questions[key].question, text: option }], urgent, riskText: urgent ? option : current.riskText };
    });
  };
  const controls = active && !paused;
  const collecting = followup || collectBeforeSearch && state.checked;
  const next = nextQuestion(state.answers);
  const evidenceQuery = consultationSearchQuestion(context, state.answers);
  useEffect(() => {
    inputBusy.current = false;
    if (!inputHandlerRef || !active || state.urgent || state.checked && next === null) return;
    const handle: ConsultationInputHandler = raw => {
      if (inputBusy.current) return 'rejected';
      const text = raw.trim();
      if (!text) return 'rejected';
      // Apply the same existing danger branches before interpreting an answer.
      const urgent = explicitEmergency(text) || Object.entries(questions).some(([key, item]) =>
        item.options.some((option, index) => option === text && answerIsEmergency(key as QuestionKey, index, text)));
      if (!urgent && (text.length > 300 || context.length + state.answers.reduce((n, item) => n + item.text.length, 0) + text.length * 2 > 1700 || interviewTurns(state, question).length >= 8)) {
        setInputNotice(text.length > 300 ? '답변을 300자 이내로 짧게 적어 주세요. 입력한 내용은 그대로 남아 있어요.'
          : '상담 내용이 길어졌어요. 현재 질문은 선택지로 답해 주세요. 작성 중인 입력은 그대로 남아 있어요.');
        return 'rejected';
      }
      inputBusy.current = true; setInputNotice(''); setPaused(false); onAdvance();
      if (urgent) {
        setState(current => ({ ...current, checked: true, urgent: true, riskText: text, turns: [...interviewTurns(current, question), { text, freeText: true }] }));
      } else if (!state.checked && /^(?:아니요|아니오|없어요|해당\s*없)/u.test(text)) {
        checkedOnce.current = true;
        setState(current => ({ ...current, checked: true, checkAnswer: text }));
        if (!collectBeforeSearch) onSearch();
      } else if (!state.checked && /^(?:네|예|있어요|잘\s*모르|모르겠)/u.test(text)) {
        checkedOnce.current = true;
        setState(current => ({ ...current, checked: true, urgent: true, checkAnswer: text, riskText: text }));
      } else {
        const key = state.checked ? next : null;
        const additional = key === null || isAdditionalSymptom(text, key);
        setState(current => ({ ...current,
          answers: additional || key === null ? current.answers : [...current.answers, { key, text, freeText: true }],
          turns: [...interviewTurns(current, question), { ...(additional || key === null ? {} : { question: questions[key].question }), text, freeText: true }],
        }));
      }
      return 'accepted';
    };
    inputHandlerRef.current = handle;
    return () => { if (inputHandlerRef.current === handle) inputHandlerRef.current = null; };
  }, [inputHandlerRef, active, state, next, context, questions, question, collectBeforeSearch, onAdvance, onSearch]);
  useEffect(() => {
    if (!searchOnComplete || !active || paused || searchDisabled || !collecting || !state.checked || state.urgent || next !== null || evidenceRequested.current) return;
    evidenceRequested.current = true;
    setState(current => ({ ...current, searchRequested: true }));
    onSearch(evidenceQuery);
  }, [searchOnComplete, active, paused, searchDisabled, collecting, state.checked, state.urgent, next, evidenceQuery, onSearch]);
  const emergency = state.urgent ? emergencyGuidance(state.riskText ?? state.riskAnswer ?? question, question) : null;
  return <View style={{ gap: 4 }}>

{!followup && bubble(question, 'user')}
{!followup && !state.urgent && (
  <View style={{ gap: 8 }}>
    <View style={[s.bubble, s.bubbleAssistant, { gap: 8 }]}>
      <Text style={s.bodyStrong}>많이 불편하시겠어요. 함께 확인해 볼게요.</Text>
      <Text style={s.paragraph}>
        {symptomLabel(question)}이 있으시군요. 언제부터, 얼마나 불편한지 필요한 것만 하나씩 여쭤볼게요.
      </Text>
      <Text style={s.paragraph}>
        답해 주신 내용을 함께 검색하고, 확인된 자료가 있을 때만 안내해 드려요. 지금 말씀만으로 원인을 판단하지는 않아요.
      </Text>
    </View>

    <View style={[s.bubble, s.bubbleAssistant, { gap: 10 }]}>
      <Text style={s.bodyStrong}>
        먼저 급한 상황인지 확인할게요.
      </Text>
      <Text style={s.paragraph}>
        숨쉬기 어렵거나 의식이 흐려졌나요?
        갑자기 매우 심한 통증이 발생했나요?
      </Text>
      <Text style={s.caption}>
        판단하기 어렵거나 급한 상황이면 응급 도움을 받으세요.
      </Text>

      {!state.checked && controls && (
        <>
          <Action
            label="해당하거나 판단하기 어려워요"
            danger
            onPress={() => check(true)}
          />
          <Action
            label={collectBeforeSearch ? '해당 없어요 · 계속하기' : '해당 없음 · 공식 자료 찾기'}
            outline
            disabled={searchDisabled}
            onPress={() => check(false)}
          />
        </>
      )}
    </View>
  </View>
)}

    {!followup && !initialUrgent && state.checkAnswer && bubble(state.checkAnswer, 'user')}
    {followup && !state.urgent && bubble('현재 확인된 공식 자료만으로는 말씀하신 증상의 원인을 설명하기 어려워요. 진단하지 않고 불편한 점을 몇 가지 확인할게요.')}
    {interviewTurns(state, question).map((item, step) => <View key={step} style={{ gap: 4 }}>
      {item.question && bubble(item.question)}{bubble(item.text, 'user')}
      {!item.question && !state.urgent && bubble('추가로 말씀하신 내용도 함께 기억할게요. 원인으로 단정하지 않고 검색할 때 참고해요.')}
    </View>)}
    {collecting && state.checked && !state.urgent && next && <View style={[s.bubble, s.bubbleAssistant, { gap: 8 }]}>
      <Text style={s.caption}>{consultationQuestionLead(next)}</Text>
      <Text style={s.paragraph}>{questions[next].question}</Text>
      <Text style={s.caption}>선택하거나 아래 입력창에 편하게 적어 주세요.</Text>
      {controls && <View style={{ gap: 8 }}>
        {questions[next].options.map((option, index) => <Action key={option} label={option} outline onPress={() => answer(state.answers.length, next, option, index)} />)}
      </View>}
    </View>}
    {!!inputNotice && <Text style={s.caption}>{inputNotice}</Text>}
    {state.riskAnswer && bubble(state.riskAnswer, 'user')}
    {state.urgent ? <>
      <EmergencyCallButton />
      {bubble(emergency!.message)}
      {emergency!.sources.map(source => <View key={source.url} style={{ gap: 4 }}>
        <Text accessibilityRole="link" style={[s.paragraph, { minHeight: 48 }]} onPress={() => {
          void Linking.openURL(source.url).catch(() => setInputNotice('출처를 열지 못했어요. 119 신고를 먼저 해 주세요.'));
        }}>공식 출처 · {source.publisher} · {source.title} ↗</Text>
        <Text style={s.caption}>{source.author} · {source.publishedAt} · {source.license}</Text>
      </View>)}
      <Text style={s.caption}>공개 지침 기반 안내이며 의료 전문가의 임상 검토는 아직 완료되지 않았어요.</Text>
    </> : collecting && !next && <>
      {bubble(consultationSummary(context, state.answers))}
      {controls && <View style={{ gap: 10 }}>
        <Action label="병원 찾기" onPress={onHospital} />
        {!searchOnComplete && <Action label="답변을 반영해 공식 자료 찾기" outline disabled={searchDisabled} onPress={() => { setState(current => ({ ...current, searchRequested: true })); onSearch(evidenceQuery); }} />}
        <Text style={s.caption}>처음 질문과 직접 답한 내용만 기존 건강정보 서버에서 검색해요. 외부 생성형 AI로 보내지 않아요.</Text>
        <Action label="문진 다시 하기" outline onPress={onRestart} />
      </View>}
    </>}
    {controls && collecting && !state.urgent && <Action label="위험 신호가 있어요 · 응급 안내" danger onPress={() => {
      onAdvance(); setState(current => ({ ...current, checked: true, urgent: true, riskAnswer: '위험 신호가 있어요', riskText: '위험 신호가 있어요' }));
    }} />}
    {active && collecting && !state.urgent && <Action label={paused ? (head ? '두통 문진 이어보기' : '문진 이어보기') : '문진 접기'} outline onPress={() => { onAdvance(); setPaused(value => !value); }} />}
  </View>;
}
