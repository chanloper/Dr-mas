import React from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { Action, C, Chip, Field, MedicineRow, Panel, QuickTile, SummaryTile, TitleRow, s } from '../components/ui';

export default function MedicationScreen() {
  const { medsReady, medsError, route, setRoute, role, setRole, tab, setTab, name, setName, email, setEmail, password, setPassword, confirm, setConfirm, showPassword, setShowPassword, meds, messages, chatInput, setChatInput, sosLeft, setSosLeft, sosNotice, sosAcknowledged, setSosAcknowledged, sosDelay, setSosDelay, roleLabel, takenCount, selectRole, submitAuth, preview, signOut, toggleMedication, sendChat, startSOS } = useDrMAS();
    return <><Text style={s.h1}>복약 관리</Text><Text style={[s.paragraph, { marginTop: 8, marginBottom: 22 }]}>오늘의 복약 상태를 관리하세요. 아래 항목은 사용자 처방 정보가 아닌 예시 일정입니다.</Text>
      <Panel style={{ backgroundColor: '#E9F8F1', borderColor: '#CEEFDC' }}><View style={s.rowBetween}><View><Text style={s.overline}>오늘의 복약 달성</Text><Text style={[s.bigValue, { color: C.green }]}>{takenCount} <Text style={s.caption}>/ {meds.length}회</Text></Text></View><Text style={{ fontSize: 35 }}>✓</Text></View><View style={s.progressTrack}><View style={[s.progressFill, { width: `${takenCount / meds.length * 100}%`, backgroundColor: C.green }]} /></View></Panel>
      {!medsReady && <Text style={s.caption}>복약 기록을 불러오고 있습니다.</Text>}
      {medsError && <Text style={[s.caption, { color: C.danger }]}>{medsError}</Text>}
      <View style={s.sectionGap}><TitleRow title="복약 체크리스트" accessory="항목을 눌러 기록" /><Panel>{meds.map(m => <MedicineRow key={m.id} med={m} onPress={() => toggleMedication(m.id)} />)}</Panel></View>
      <View style={s.sectionGap}><Panel><Text style={s.bodyStrong}>처방전과 연동하기</Text><Text style={[s.paragraph, { marginTop: 7 }]}>향후 실제 OCR 분석 후 약품명을 확인하고 복용 스케줄을 등록할 수 있도록 연결할 예정입니다.</Text><View style={{ marginTop: 12 }}><Action label="처방전 기능 보기" outline small onPress={() => setTab('services')} /></View></Panel></View>
      <Text style={s.disclaimer}>복약 체크는 이 기기에 날짜별로 저장됩니다. 예시 일정이므로 의료진의 실제 복약 지시를 우선하세요.</Text>
    </>;
  }
