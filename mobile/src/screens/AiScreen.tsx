import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { Action, AppIcon, C, StatusMessage, s } from '../components/ui';
import { EvidenceDetailsModal } from '../components/EvidenceDetailsModal';
import { FeatureModal } from '../components/FeatureModal';
import { ChatMessage } from '../components/ChatMessage';
import { ragConfigured, ragDevelopmentEndpoint } from '../services/rag';
import type { Chat } from '../features/app/types';
import { useRouter } from 'expo-router';
import { EmergencyCallButton } from '../components/EmergencyCallButton';
import { HiraReferencePanel } from '../components/HiraReferencePanel';
import { HeadacheConversation } from '../components/HeadacheConversation';
import { consultationDisplayQuestion, explicitEmergency, followupSearchQuestion, isSymptomInput, type ConsultationInputHandler } from '../services/consultationFlow';
import { PublicMedicineInfo } from '../components/PublicMedicineInfo';
import { PlacesContent } from '../app/places';

const suggestions = ['머리가 아파요', '배가 아파요', '기침이 나요'].map(question => ({ label: question, question }));

export default function AiScreen({ historyRequest = 0, onHistoryHandled }: { historyRequest?: number; onHistoryHandled?: () => void }) {
  const model = useDrMAS();
  return <ConsultationChat key={model.consultation?.current.id ?? 'current'} historyRequest={historyRequest} onHistoryHandled={onHistoryHandled} />;
}
export function ConsultationChat({ historyRequest = 0, onHistoryHandled }: { historyRequest?: number; onHistoryHandled?: () => void } = {}) {
  const router = useRouter();
  const { messages, chatInput, setChatInput, sendChat, chatLoading: sending, chatStage, chatNotice, cancelChat, consultation, markEmergency, sendEmergencyQuestion, newConsultation, openConsultation, deleteConsultation, setTab } = useDrMAS();
  const [evidence, setEvidence] = useState<Chat | null>(null), [voice, setVoice] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [medicineOpen, setMedicineOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [placeCategory, setPlaceCategory] = useState<'hospital' | 'pharmacy' | null>(null);
  const [interviewEnabled, setInterviewEnabled] = useState(false);
  const [localUrgent, setLocalUrgent] = useState(false);
  const urgent = !!consultation?.current.emergency || localUrgent;
  const setUrgent = (value: boolean, reported?: string, context?: string) => {
    setLocalUrgent(value);
    if (value && reported) markEmergency?.(reported, context ?? reported);
  };
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyAction, setHistoryAction] = useState<{ kind: 'new' | 'delete' | 'open'; id?: number; message: string } | null>(null);
  const [generalInfo, setGeneralInfo] = useState(false);
  const [localInterviews, setLocalInterviews] = useState<{ question: string; anchor: number; followup?: boolean }[]>([]);
  const interviews = consultation?.current.interviews ?? localInterviews;
  const setInterviews: typeof setLocalInterviews = value => consultation ? consultation.update('interviews', value) : setLocalInterviews(value);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const following = useRef(true);
  const dragging = useRef(false);
  const [away, setAway] = useState(false);
  const [composing, setComposing] = useState(false);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const webSubmitPending = useRef(false);
  const interviewInput = useRef<ConsultationInputHandler | null>(null);
  useEffect(() => {
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      setComposing(false);
      input.current?.blur();
    });
    return () => hidden.remove();
  }, []);
  const configured = ragConfigured();
  const developmentEndpoint = ragDevelopmentEndpoint?.();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 380 || fontScale > 1.25;
  // Derive followups from completed responses; stable keys preserve their answers
  // as later RAG messages arrive without copying server state into an effect.
  const timelineInterviews = interviews.map((interview, index) => ({ ...interview, key: `manual:${index}` }));
  const started = interviews.length > 0 || messages.some(message => message.sender === 'user');
  const failed = messages.at(-1)?.outcome === 'error' || messages.at(-1)?.outcome === 'cancelled';
  const lastResponse = messages.slice().reverse().find(message => message.sender === 'assistant' && message.outcome === 'response');
  const emergency = urgent || lastResponse?.status === 'emergency';
  const activeInterview = interviewEnabled && timelineInterviews.length > 0 && timelineInterviews.at(-1)?.anchor === messages.length;
  const needsMoreEvidence = messages.at(-1)?.outcome === 'response' && messages.at(-1)?.status === 'insufficient_evidence';
  const retryQuestion = failed ? messages.slice().reverse().find(message => message.sender === 'user')?.text : undefined;
  const followLatest = () => { if (started && following.current) scroll.current?.scrollToEnd({ animated: false }); };
  const latest = () => { following.current = true; setAway(false); scroll.current?.scrollToEnd({ animated: true }); };
  const send = (question?: string) => {
    if (sending || !(question ?? chatInput).trim() || Platform.OS === 'web' && webSubmitPending.current) return;
    if (Platform.OS === 'web') {
      // Coalesce Enter/button events before React commits the new draft/busy state.
      webSubmitPending.current = true;
      void Promise.resolve().then(() => { webSubmitPending.current = false; });
    }
    setComposing(false);
    if (consultation?.current.emergency && !sending) {
      Keyboard.dismiss(); following.current = true; setAway(false); sendEmergencyQuestion(); return;
    }
    // Keep drafts editable offline; do not clear or route them as sent.
    const input = question ?? chatInput;
    if (sending || !configured && !explicitEmergency(input)) return;
    Keyboard.dismiss();
    following.current = true; setAway(false);
    // A preliminary check, not a diagnosis or a complete emergency assessment.
    if (!input.trim()) return;
    if (!explicitEmergency(input) && interviewEnabled && typeof interviewInput.current === 'function') {
      if (interviewInput.current(input) === 'accepted') setChatInput('');
      return;
    }
    const previous = messages.slice().reverse().find(message => message.sender === 'user')?.text;
    const query = followupSearchQuestion(input, previous);
    void sendChat(query, true);
  };
  const startNew = () => {
    if (emergency) setHistoryAction({ kind: 'new', message: '새 상담은 이전 응급상황이 해결됐다는 의미가 아닙니다. 119 신고·진료를 미루지 마세요. 보관에 동의하지 않은 현재 상담은 지워집니다.' });
    else if (!consultation?.current.consent && (started || chatInput)) setHistoryAction({ kind: 'new', message: '현재 상담은 보관하지 않기로 되어 있어 새 상담을 시작하면 지워집니다.' });
    else newConsultation();
  };
  const closeHistory = () => { setHistoryOpen(false); onHistoryHandled?.(); };
  return <View style={s.flex}>
    <View style={{ width: '100%', maxWidth: 880, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 12, backgroundColor: C.white }}>
      <Action small outline label="상담 기록" onPress={() => setHistoryOpen(true)} />
      <View style={{ flex: 1, minWidth: 128, alignItems: 'center' }}><Text accessibilityRole="header" style={[s.bodyStrong, { textAlign: 'center' }]}>Dr.MAS 건강지킴이</Text></View>
      <Action small outline label="새 상담" onPress={startNew} />
    </View>
    <ScrollView ref={scroll} style={s.flex} contentContainerStyle={[s.page, width < 380 && s.compactPage, { paddingBottom: 12 }]}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets
      onContentSizeChange={followLatest} onLayout={followLatest} scrollEventThrottle={100}
      onScrollBeginDrag={() => {
        dragging.current = true; following.current = false;
        if (composing) { setComposing(false); Keyboard.dismiss(); }
      }}
      onScrollEndDrag={() => { dragging.current = false; }}
      onScroll={({ nativeEvent: { contentOffset, layoutMeasurement, contentSize } }) => {
        if (!dragging.current) return;
        const nearEnd = contentOffset.y + layoutMeasurement.height >= contentSize.height - 96;
        following.current = nearEnd; setAway(!nearEnd);
      }}>
      {consultation?.current.reopened && <Text style={[s.paragraph, { color: C.danger }]}>과거 상담 기록입니다. 응급상황이 해결됐다는 의미가 아니며 현재 상태를 판정하지 않습니다.</Text>}
      {!started ? <>
        <View style={{ alignItems: 'center', paddingTop: 24, gap: 12 }}><View style={[s.tileIcon, { backgroundColor: C.mint }]}><AppIcon name="assistant" size={32} /></View><Text style={s.h1}>어떤 정보가 궁금하세요?</Text></View>
        <View style={[s.panel,{marginTop:12,marginBottom:20}]}><Text style={s.paragraph}>안녕하세요. 불편한 점을 편하게 적어 주세요. 확인된 공식 자료를 함께 찾아볼게요.</Text></View>
        <Text style={[s.caption, { marginBottom: 8 }]}>눌러서 질문 칸에 넣어 보세요</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{suggestions.map(({ label, question }) => <Pressable key={question}
          accessibilityRole="button" accessibilityLabel={`추천 질문: ${question}`} accessibilityState={{ disabled: sending }} disabled={sending}
          onPress={() => setChatInput(question)} style={({ pressed }) => [s.suggestionPill, { opacity: sending ? .5 : pressed ? .7 : 1 }]}><Text style={[s.paragraph, { color: C.blue }]}>{label} ↗</Text></Pressable>)}</View>
        <Text style={[s.caption, { marginTop: 16 }]}>등록된 의료자료에서 찾아드려요. 증상에 맞는 자료가 부족할 수 있으며, 진단은 하지 않아요.</Text>
        <Text style={[s.caption, { marginTop: 8 }]}>개인 식별정보는 입력하지 마세요. 상담 기록은 동의한 경우에만 현재 로그인 동안 보관됩니다.</Text>
        {consultation && <Action small outline label={consultation.current.consent ? '현재 로그인 동안 보관 중 · 보관 중지' : '상담 내용을 현재 로그인 동안 보관하는 데 동의'} onPress={() => consultation.update('consent', !consultation.current.consent)} />}
      </> : <View style={{ gap: 4 }}>{Array.from({ length: messages.length + 1 }, (_, position) => <React.Fragment key={position}>
        {timelineInterviews.map((interview, index) => interview.anchor === position && <HeadacheConversation key={interview.key}
          question={interview.question} followup={interview.followup} collectBeforeSearch searchOnComplete active={interviewEnabled && index === timelineInterviews.length - 1 && !sending && !urgent && position === messages.length}
          inputHandlerRef={interviewInput} searchDisabled={sending || !configured} onEmergency={setUrgent} onAdvance={() => { Keyboard.dismiss(); following.current = true; setAway(false); }}
          savedState={consultation?.current.snapshots[interview.key]}
          onStateChange={consultation ? snapshot => consultation.update('snapshots', old => ({ ...old, [interview.key]: snapshot })) : undefined}
          onSearch={query => { following.current = true; setAway(false); void sendChat(query ?? interview.question); }}
          onRestart={() => { following.current = true; setAway(false); setInterviews(current => [...current, { question: interview.question, anchor: messages.length, followup: true }]); }}
          onHospital={() => router.push({ pathname: '/places', params: { category: 'hospital' } })} />)}
        {position < messages.length && !interviews.some(interview => !interview.followup && interview.anchor === position
          && messages[position].sender === 'user' && consultationDisplayQuestion(messages[position].text) === interview.question)
          && <ChatMessage message={messages[position].sender === 'user' ? { ...messages[position], text: consultationDisplayQuestion(messages[position].text) } : messages[position]} question={messages.slice(0, position).reverse().find(message => message.sender === 'user')?.text} onEvidence={() => setEvidence(messages[position])} onPharmacy={() => setPlaceCategory('pharmacy')} onMedicineTools={() => setMedicineOpen(true)} />}
      </React.Fragment>)}</View>}
      {!configured && <StatusMessage>일반 자료 검색은 서버 연결이 필요해요. 응급 안내와 응급 후속 질문은 네트워크 없이도 이용할 수 있어요.</StatusMessage>}
      {developmentEndpoint && <Text selectable style={s.caption}>개발 연결 확인: {developmentEndpoint}</Text>}
      {sending && <><StatusMessage kind="loading">{chatStage === 'session' ? '로그인 상태를 확인하고 있어요.' : chatStage === 'response' ? '받은 자료와 출처를 확인하고 있어요.' : '서버에 자료를 요청했어요. 응답을 기다리고 있어요.'}</StatusMessage><Action label="검색 요청 취소" small outline onPress={cancelChat} /></>}
      {!sending && configured && retryQuestion && <Action label="같은 질문 다시 시도" small outline onPress={() => {
        // Retry the exact request, including selected facts, without restarting
        // an interview or overwriting a separately composed draft.
        following.current = true; setAway(false); void sendChat(retryQuestion);
      }} />}
      {chatNotice && <StatusMessage kind="error">{chatNotice}</StatusMessage>}
      {emergency && <View style={{ gap: 12 }}><StatusMessage kind="error">응급 안내 상태입니다. 후속 질문을 할 수 있지만 신고·진료를 기다리게 하는 상담은 하지 않습니다.</StatusMessage><EmergencyCallButton /></View>}
      {needsMoreEvidence && !sending && !emergency && !activeInterview && <View style={{ gap: 12, marginTop: 16 }}>
        <Text style={s.paragraph}>현재 확인된 공식 의료자료만으로는 이 증상에 대한 자세한 설명이 어려워요.</Text>
        <Text style={s.bodyStrong}>다음으로 어떻게 도와드릴까요?</Text>
        <Action label="증상을 더 자세히 적기" outline onPress={() => {
          const question = messages.slice().reverse().find(message => message.sender === 'user')?.text ?? '';
          setChatInput(`${question}\n언제부터: \n불편한 정도: \n함께 나타나는 증상: `);
        }} />
        <Text style={s.paragraph}>언제부터, 얼마나 불편한지 적어 주세요. 개인정보는 적지 마세요. 추가로 적어도 관련 자료가 없을 수 있어요.</Text>
        <Action label="AI 일반 건강정보 안내" outline onPress={() => setGeneralInfo(true)} />
        <Text style={s.paragraph}>AI 일반 상담은 아직 이용할 수 없어요. 안내를 열어도 질문이 외부로 전송되지 않아요.</Text>
      </View>}
    </ScrollView>
    <FeatureModal visible={toolsOpen} title="상담 도구" onClose={() => setToolsOpen(false)}>
      <View style={{ gap: 10 }}>
        {emergency ? <>
          <Action label="홈의 보호자 SOS 화면 열기" outline small onPress={() => setTab('home')} />
          <Text style={s.caption}>화면만 엽니다. 보호자 SOS는 119 신고를 대신하지 않으며 자동으로 전송하지 않습니다.</Text>
        </> : <>
          <Text style={s.bodyStrong}>병원·약국 정보가 필요하신가요?</Text>
          <Text style={s.caption}>기관을 검색할 수 있어요. 진료 필요 여부나 진료 가능한 기관을 판단한 결과는 아니에요.</Text>
          <Action label="병원 찾기" outline small onPress={() => { setToolsOpen(false); setPlaceCategory('hospital'); }} />
          <Action label="약국 찾기" outline small onPress={() => { setToolsOpen(false); setPlaceCategory('pharmacy'); }} />
          <Action label="의약품 공식 정보 조회" outline small onPress={() => { setToolsOpen(false); setMedicineOpen(true); }} />
          <Action label="질병정보 자세히 찾기" outline small onPress={() => { setToolsOpen(false); setReferenceOpen(true); }} />
          <Text style={s.caption}>증상만으로 약을 추천하지 않아요. 제품명으로 식약처 효능·주의사항·부작용·상호작용 정보를 직접 확인할 수 있어요.</Text>
          <Action label={activeInterview ? '선택 문진 접기 · 자유 대화 계속' : '선택 문진으로 더 확인'} small outline onPress={() => {
            if (activeInterview) { setInterviewEnabled(false); return; }
            const previous = messages.slice().reverse().find(message => message.sender === 'user')?.text ?? '';
            if (!isSymptomInput(previous)) return;
            if (!timelineInterviews.length || timelineInterviews.at(-1)?.anchor !== messages.length) setInterviews(current => [...current, { question: previous, anchor: messages.length, followup: true }]);
            setInterviewEnabled(true);
            setToolsOpen(false);
          }} />
          <Text style={s.caption}>질문은 검색 화면에 전달하지 않아요. 현재 위치는 주변 검색을 누르고 권한을 허용한 경우에만 사용해요.</Text>
        </>}
      </View>
    </FeatureModal>
    {away && started && <View style={{ alignSelf: 'center', paddingBottom: 6 }}><Action label="최근 대화로 이동" small outline onPress={latest} /></View>}

<View style={{ width: '100%', maxWidth: 880, alignSelf: 'center', flexShrink: 0, paddingHorizontal: width < 380 ? 12 : 16, paddingVertical: 4, backgroundColor: C.bg }}>
  <View style={[s.composerSurface, { padding: composing ? 10 : 4 }]}>

    <View
      style={{
        flexDirection: composing && stacked && !activeInterview ? 'column' : 'row',
        alignItems: composing && stacked && !activeInterview ? 'stretch' : 'flex-end',
        gap: 8,
      }}
    >
      <Pressable accessibilityRole="button" accessibilityLabel="상담 도구 열기" onPress={() => setToolsOpen(true)} style={{ minWidth: 48, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: C.mint }}><Text style={{ fontSize: 28, color: C.blue }}>+</Text></Pressable>
      <TextInput
        ref={input}
        multiline
        numberOfLines={composing ? 4 : 1}
        scrollEnabled={composing}
        onFocus={() => setComposing(true)}
        // Web blur happens on pointer-down, before the button's pointer-up.
        // Collapsing here moves the send button and cancels that first click.
        onBlur={() => { if (Platform.OS !== 'web') setComposing(false); }}
        accessibilityLabel="건강 상담 메시지"
        editable={!sending}
        maxLength={2000}
        style={[
          s.input,
          sending && s.inputDisabled,
          {
            flex: composing && stacked && !activeInterview ? undefined : 1,
            minHeight: composing ? 72 : 56,
            maxHeight: composing ? 140 : 56,
            borderWidth: 0,
            backgroundColor: 'transparent',
            paddingHorizontal: 6,
            paddingVertical: 12,
            textAlignVertical: 'top',
          },
        ]}
        value={chatInput}
        onChangeText={setChatInput}
        // React Native Web forwards the DOM keydown event through onKeyPress.
        // Leave native/mobile multiline and keyboard behavior untouched.
        onKeyPress={Platform.OS === 'web' ? event => {
          const key = event.nativeEvent as typeof event.nativeEvent & {
            shiftKey?: boolean; isComposing?: boolean; keyCode?: number; repeat?: boolean;
          };
          if (key.key !== 'Enter' || key.shiftKey || key.isComposing || key.keyCode === 229) return;
          event.preventDefault();
          if (!key.repeat) send();
        } : undefined}
        placeholder="예: 머리가 아파요"
        placeholderTextColor={C.muted}
      />

      <View
        style={{
          width: composing && stacked && !activeInterview
            ? '100%'
            : fontScale > 1.25
              ? 112
              : 84,
        }}
      >
        <Action
          label={sending ? '확인 중' : '보내기'}
          small={!composing}
          disabled={!configured && !consultation?.current.emergency && !explicitEmergency(chatInput) || sending || !chatInput.trim()}
          onPress={() => send()}
        />
      </View>
    </View>

    {composing && !activeInterview && (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="음성 입력 안내 · 준비 중"
        onPress={() => setVoice(true)}
        style={{ minHeight: 48, justifyContent: 'center' }}
      >
        <Text style={[s.paragraph, { color: C.muted }]}>
          음성 입력 · 준비 중 ⓘ
        </Text>
      </Pressable>
    )}

    {composing && <View style={[s.rowBetween, { marginTop: 6 }]}>
      <Text style={s.caption}>응급 상황은 119</Text>
      <Text style={s.caption}>{chatInput.length} / 2000자</Text>
    </View>}
  </View>
</View>

    <EvidenceDetailsModal key={evidence?.id ?? 'no-evidence'} message={evidence?.text ?? null} sources={evidence?.sources} onClose={() => setEvidence(null)} />
    <FeatureModal visible={placeCategory !== null} title="주변 의료기관 검색" fullHeight scrollContent={false} onClose={() => setPlaceCategory(null)}>
      {placeCategory && <PlacesContent key={placeCategory} initialCategory={placeCategory} onClose={() => setPlaceCategory(null)} />}
    </FeatureModal>
    <FeatureModal visible={medicineOpen} title="식약처 의약품 공식 정보" onClose={() => setMedicineOpen(false)}>
      {medicineOpen && <PublicMedicineInfo />}
      <Text style={s.caption}>현재 상담에서 특정 의약품의 복용 적합성은 확인하지 않았습니다. 공개 검색은 약품 추천이나 처방이 아닙니다.</Text>
    </FeatureModal>
    <FeatureModal visible={historyOpen || historyRequest > 0} title="현재 로그인 동안의 상담 기록" onClose={closeHistory}>
      <Text style={s.paragraph}>동의한 상담만 목록에 나타납니다. 계정 전환·로그아웃·새로고침·앱 종료 후에는 남지 않습니다. 보호자에게 공유하지 않습니다.</Text>
      {consultation && <Action small outline label={consultation.current.consent ? '현재 로그인 동안 보관 중 · 보관 중지' : '상담 내용을 현재 로그인 동안 보관하는 데 동의'} onPress={() => consultation.update('consent', !consultation.current.consent)} />}
      {!consultation?.records.length && <Text style={s.paragraph}>보관한 상담이 없습니다.</Text>}
      {consultation?.records.map(record => <View key={record.id} style={s.sourceCard}>
        <Text style={s.bodyStrong}>상담 {record.id} · {new Date(record.createdAt).toLocaleString('ko-KR')}</Text>
        <Text style={s.caption}>{record.emergency ? '과거 응급 안내 포함 · 현재 상태 판정 아님' : '건강정보 상담'}</Text>
        <Action label="상담 열기 · 이어보기" outline onPress={() => {
          closeHistory();
          if (consultation.current.id !== record.id && !consultation.current.consent && (started || chatInput)) setHistoryAction({ kind: 'open', id: record.id, message: '보관에 동의하지 않은 현재 상담과 초안은 지워집니다. 선택한 기록을 열까요?' });
          else openConsultation(record.id);
        }} />
        <Action label="이 상담 삭제" outline onPress={() => { closeHistory(); setHistoryAction({ kind: 'delete', id: record.id, message: '이 상담을 메모리에서 삭제할까요?' }); }} />
      </View>)}
      <Action label="상담 기록 전체 삭제" outline onPress={() => { closeHistory(); setHistoryAction({ kind: 'delete', message: '현재 상담과 보관 기록을 모두 삭제할까요?' }); }} />
    </FeatureModal>
    <FeatureModal visible={historyAction !== null} title="상담 기록 확인" onClose={() => setHistoryAction(null)}>
      <Text style={s.paragraph}>{historyAction?.message}</Text>
      <Action label={historyAction?.kind === 'delete' ? '삭제 확인' : '상담 전환 확인'} danger={historyAction?.kind === 'delete'} onPress={() => {
        const action = historyAction; setHistoryAction(null);
        if (action?.kind === 'new') newConsultation();
        else if (action?.kind === 'open' && action.id !== undefined) openConsultation(action.id);
        else if (action?.kind === 'delete') deleteConsultation(action.id);
      }} />
      <Action label="취소" outline onPress={() => setHistoryAction(null)} />
    </FeatureModal>
    <FeatureModal visible={generalInfo} title="AI 일반 건강정보 · 준비 중" onClose={() => setGeneralInfo(false)}>
      <Text style={s.paragraph}>AI가 만든 일반 정보는 공식 자료의 원문 인용과 달라요. 잘못된 내용이 있을 수 있고 진단이나 처방을 대신하지 않아요.</Text>
      <Text style={s.paragraph}>외부 전송 조건과 안전한 서버 처리가 준비되지 않아 지금은 이용할 수 없어요. 이 화면에서는 동의를 받거나 건강정보를 전송하지 않아요.</Text>
      <Action label="AI 상담 · 아직 이용할 수 없음" disabled onPress={() => {}} />
      <Action label="병원 찾기" outline onPress={() => { setGeneralInfo(false); router.push({ pathname: '/places', params: { category: 'hospital' } }); }} />
    </FeatureModal>
    <FeatureModal visible={referenceOpen} title="자세히 찾기" onClose={() => setReferenceOpen(false)}>{referenceOpen && <HiraReferencePanel kind="disease" onChooseName={name => { setChatInput(name); setReferenceOpen(false); }} />}</FeatureModal>
    <FeatureModal visible={voice} title="음성 입력 안내" onClose={() => setVoice(false)}><StatusMessage>음성 입력은 아직 준비 중이에요. 지금은 질문을 직접 입력해 주세요. 녹음이나 음성 전송은 하지 않아요.</StatusMessage><Action label="음성 입력 · 준비 중" disabled onPress={() => {}} /></FeatureModal>
  </View>;
}
