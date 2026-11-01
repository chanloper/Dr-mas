import React from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { Action, C, Chip, Field, MedicineRow, Panel, QuickTile, SummaryTile, TitleRow, s } from '../components/ui';

export default function AiScreen() {
  const { route, setRoute, role, setRole, tab, setTab, name, setName, email, setEmail, password, setPassword, confirm, setConfirm, showPassword, setShowPassword, meds, messages, chatInput, setChatInput, sosLeft, setSosLeft, sosNotice, sosAcknowledged, setSosAcknowledged, sosDelay, setSosDelay, roleLabel, takenCount, selectRole, submitAuth, preview, signOut, toggleMedication, sendChat, startSOS } = useDrMAS();
    return <><Text style={s.h1}>AI 건강 상담</Text><Text style={[s.paragraph, { marginTop: 8, marginBottom: 16 }]}>건강에 대한 궁금증을 편하게 남겨보세요.</Text>
      <View style={s.alertSoft}><Text style={s.alertSoftText}>ⓘ AI 상담 서비스가 아직 연결되지 않았습니다. 현재 입력한 메시지에는 자동 의료 상담이 제공되지 않습니다.</Text></View>
      <Panel style={{ marginTop: 15, padding: 14 }}>
        {messages.map(m => <View key={m.id} style={[s.bubble, m.sender === 'user' ? s.bubbleUser : s.bubbleAssistant]}><Text style={{ color: m.sender === 'user' ? C.white : C.ink, fontSize: 14, lineHeight: 21 }}>{m.text}</Text></View>)}
      </Panel>
      <View style={[s.row, { alignItems: 'flex-end', marginTop: 14 }]}><TextInput multiline accessibilityLabel="건강 상담 메시지" style={[s.input, { flex: 1, minHeight: 52, maxHeight: 130, paddingTop: 12 }]} value={chatInput} onChangeText={setChatInput} placeholder="건강 관련 질문을 입력하세요" placeholderTextColor={C.subtle} /><View style={{ width: 78, marginLeft: 8 }}><Action label="전송" onPress={sendChat} small /></View></View>
      <Text style={s.disclaimer}>응급 증상이 있다면 상담 답변을 기다리지 말고 즉시 119 또는 의료기관에 연락하세요.</Text>
    </>;
  }
