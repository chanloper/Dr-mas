import React from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { Action, C, Chip, Field, MedicineRow, Panel, QuickTile, SummaryTile, TitleRow, s } from '../components/ui';

export default function SettingsScreen() {
  const { route, setRoute, role, setRole, tab, setTab, name, setName, email, setEmail, password, setPassword, confirm, setConfirm, showPassword, setShowPassword, meds, messages, chatInput, setChatInput, sosLeft, setSosLeft, sosNotice, sosAcknowledged, setSosAcknowledged, sosDelay, setSosDelay, roleLabel, takenCount, selectRole, submitAuth, preview, signOut, toggleMedication, sendChat, startSOS } = useDrMAS();
    return <><Text style={s.h1}>설정</Text><Text style={[s.paragraph, { marginTop: 8, marginBottom: 24 }]}>계정 및 앱 설정을 관리합니다.</Text>
      <Panel><TitleRow title="현재 화면" /><View style={[s.rowBetween, { marginTop: 12 }]}><Text style={s.bodyStrong}>{roleLabel} 모드</Text><Chip text="기기 내 이용" /></View>
        <Text style={[s.caption, { marginTop: 12, marginBottom: 14 }]}>로그인 정보는 서버에 연결되거나 저장되지 않았습니다.</Text><Action label={role === 'patient' ? '보호자 화면 보기' : '환자 화면 보기'} outline small onPress={() => { setRole(v => v === 'patient' ? 'guardian' : 'patient'); setTab('home'); }} />
      </Panel>
      <View style={s.sectionGap}><Panel><TitleRow title="SOS 알림 대기시간" accessory={`${sosDelay}초`} /><Text style={[s.caption, { marginVertical: 12 }]}>앱 내부 알림 흐름에만 적용됩니다. 실제 보호자 메시지는 발송되지 않습니다.</Text><View style={s.row}>{[10, 20, 30].map(n => <Pressable key={n} style={[s.delayChip, sosDelay === n && s.delaySelected]} onPress={() => setSosDelay(n)}><Text style={{ fontWeight: '700', color: sosDelay === n ? C.white : C.blue }}>{n}초</Text></Pressable>)}</View></Panel></View>
      <View style={s.sectionGap}><Panel><TitleRow title="안내" /><Text style={[s.paragraph, { marginTop: 12 }]}>Dr.MAS는 의료진의 진단이나 응급 구조 서비스를 대체하지 않습니다. 건강 데이터와 보호자 연결 기능은 해당 서비스가 연결된 후 이용할 수 있습니다.</Text></Panel></View>
      <View style={s.sectionGap}><Action label="첫 화면으로 돌아가기" outline onPress={signOut} /></View>
    </>;
  }
