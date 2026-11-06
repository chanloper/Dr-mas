import React, { useState } from 'react';
import { Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { Action, C, Panel, StatusMessage, s } from '../components/ui';
import { EvidenceDetailsModal } from '../components/EvidenceDetailsModal';
import { FeatureModal } from '../components/FeatureModal';
import { ragConfigured } from '../services/rag';
import type { Chat } from '../features/app/types';

export default function AiScreen() {
  const { messages, chatInput, setChatInput, sendChat, chatLoading: sending, chatNotice, cancelChat } = useDrMAS();
  const [evidence, setEvidence] = useState<Chat | null>(null), [voice, setVoice] = useState(false);
  const configured = ragConfigured();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 380 || fontScale > 1.25;
    return <><Text style={s.h1}>AI 건강 상담</Text><Text style={[s.paragraph, { marginTop: 8, marginBottom: 16 }]}>건강에 대한 궁금증을 편하게 남겨보세요.</Text>
      <View style={s.alertSoft}><Text style={s.alertSoftText}>ⓘ 개인정보 없이 일반 질문만 입력하세요. 확인된 자료를 검색하며 자동 의료 상담이 제공되지 않습니다.</Text></View>
      {!configured && <StatusMessage>현재 실행 환경에 맞는 의료자료 검색 서버가 연결되지 않았습니다. 서버 연결 전에는 질문을 전송하지 않습니다.</StatusMessage>}
      <Panel style={{ marginTop: 15, padding: 14 }}>
        {!messages.length && <StatusMessage kind="empty">질문을 입력하면 확인된 자료를 바탕으로 답변을 확인할 수 있습니다.</StatusMessage>}
        {messages.map(m => <View key={m.id} style={[s.bubble, m.sender === 'user' ? s.bubbleUser : s.bubbleAssistant]}>
          {m.outcome === 'error' && <Text style={[s.bodyStrong, { color: C.danger, marginBottom: 8 }]}>검색 요청 실패</Text>}
          {m.outcome === 'cancelled' && <Text style={[s.caption, { marginBottom: 8 }]}>요청 취소</Text>}
          {m.status === 'local_evidence' && <Text style={[s.bodyStrong, { marginBottom: 8 }]}>공식 자료 검색·원문 인용</Text>}
          {m.status === 'insufficient_evidence' && <Text style={[s.bodyStrong, { marginBottom: 8 }]}>확인된 근거 부족</Text>}
          <Text selectable style={{ color: m.sender === 'user' ? C.white : C.ink, fontSize: 16, lineHeight: 26 }}>{m.text}</Text>
          {!!m.sources?.length && <Text style={[s.caption, { marginTop: 10 }]}>근거 자료 {m.sources.length}건 · 출처와 이용 조건을 확인하세요.</Text>}
          {m.sender === 'assistant' && m.outcome !== 'error' && m.outcome !== 'cancelled' && <View style={{ marginTop: 12 }}><Action small outline label={m.sources?.length ? '근거·출처 보기' : '출처 확인 안내'} onPress={() => setEvidence(m)} /></View>}
        </View>)}
      </Panel>
      {sending && <><StatusMessage kind="loading">자료를 확인하고 있습니다. 잠시 기다려 주세요.</StatusMessage><Action label="검색 요청 취소" small outline onPress={cancelChat} /></>}
      {chatNotice && <StatusMessage kind="error">{chatNotice}</StatusMessage>}
      <View style={{ flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'stretch' : 'flex-end', gap: 10, marginTop: 14 }}><TextInput multiline accessibilityLabel="건강 상담 메시지" editable={!sending && configured} maxLength={2000} style={[s.input, (sending || !configured) && s.inputDisabled, { flex: stacked ? undefined : 1, minHeight: 72, maxHeight: 160, paddingTop: 12, textAlignVertical: 'top' }]} value={chatInput} onChangeText={setChatInput} placeholder="건강 관련 질문을 입력하세요" placeholderTextColor={C.muted} /><View style={{ width: stacked ? '100%' : 84 }}><Action label={sending ? '확인 중' : '전송'} disabled={!configured || sending || !chatInput.trim()} onPress={() => { void sendChat(); }} small /></View></View>
      <Text style={[s.caption, { textAlign: 'right', marginTop: 6 }]}>{chatInput.length} / 2000자</Text>
      <Text style={s.disclaimer}>응급 증상이 있다면 상담 답변을 기다리지 말고 즉시 119 또는 의료기관에 연락하세요.</Text>
      <View style={{ marginTop: 12 }}><Action label="음성 입력 안내" outline small onPress={() => setVoice(true)} /></View>
      <EvidenceDetailsModal key={evidence?.id ?? 'no-evidence'} message={evidence?.text ?? null} sources={evidence?.sources} onClose={() => setEvidence(null)} />
      <FeatureModal visible={voice} title="음성으로 질문하기" onClose={() => setVoice(false)}><StatusMessage>마이크·음성 인식은 미연결입니다. 녹음이나 음성 전송을 하지 않습니다. 현재는 질문을 직접 입력해 주세요.</StatusMessage><Action label="음성 입력 시작 · 미연결" disabled onPress={() => {}} /></FeatureModal>
    </>;
  }
