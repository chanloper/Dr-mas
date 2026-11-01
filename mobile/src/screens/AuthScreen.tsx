import React from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { Action, C, Chip, Field, MedicineRow, Panel, QuickTile, SummaryTile, TitleRow, s } from '../components/ui';

export default function AuthScreen() {
  const { route, setRoute, role, setRole, tab, setTab, name, setName, email, setEmail, password, setPassword, confirm, setConfirm, showPassword, setShowPassword, meds, messages, chatInput, setChatInput, sosLeft, setSosLeft, sosNotice, sosAcknowledged, setSosAcknowledged, sosDelay, setSosDelay, roleLabel, takenCount, selectRole, submitAuth, preview, signOut, toggleMedication, sendChat, startSOS } = useDrMAS();
    return <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.page, { flexGrow: 1, justifyContent: 'center' }]}>
        <Pressable accessibilityRole="button" onPress={() => { setRoute('welcome'); setPassword(''); }} style={s.back}><Text style={s.backText}>‹  역할 선택으로 돌아가기</Text></Pressable>
        <View style={s.brandMark}><Text style={s.brandSymbol}>✚</Text></View>
        <Chip text={`${roleLabel} 전용 서비스`} kind={role === 'guardian' ? 'green' : 'blue'} />
        <Text style={[s.h1, { marginTop: 15 }]}>{route === 'login' ? '다시 만나서 반가워요' : 'Dr.MAS 시작하기'}</Text>
        <Text style={s.paragraph}>{route === 'login' ? '안전하고 편리한 건강 관리의 시작' : '건강을 연결하는 첫걸음에 함께해요'}</Text>
        <Panel style={{ marginTop: 25 }}>
          {route === 'register' && <Field label="이름" value={name} onChangeText={setName} placeholder="이름을 입력해 주세요" />}
          <Field label="이메일" value={email} onChangeText={setEmail} placeholder="example@email.com" keyboardType="email-address" autoCapitalize="none" />
          <Field label="비밀번호" value={password} onChangeText={setPassword} placeholder="8자 이상 입력" secureTextEntry={!showPassword} />
          <Pressable onPress={() => setShowPassword(v => !v)} style={{ alignSelf: 'flex-end', marginTop: -6, marginBottom: 14 }}><Text style={s.link}>{showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}</Text></Pressable>
          {route === 'register' && <Field label="비밀번호 확인" value={confirm} onChangeText={setConfirm} placeholder="비밀번호를 다시 입력" secureTextEntry={!showPassword} />}
          <Action label={route === 'login' ? '로그인' : '회원가입'} onPress={submitAuth} />
          <Pressable onPress={() => { setRoute(route === 'login' ? 'register' : 'login'); setPassword(''); setConfirm(''); }} style={{ padding: 14, alignItems: 'center' }}>
            <Text style={s.link}>{route === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}</Text>
          </Pressable>
        </Panel>
        <View style={s.demoPanel}><Text style={s.demoTitle}>서비스 둘러보기</Text><Text style={s.caption}>계정 서비스가 연결되기 전까지 일부 기능을 기기에서 살펴볼 수 있습니다.</Text><Action label={`${roleLabel} 화면으로 이동 →`} onPress={preview} outline small /></View>
      </ScrollView>
    </KeyboardAvoidingView>;
  }
