import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Dr.MAS mobile UI prototype (Rev.5 visual language).
// No authentication, emergency delivery, GPS, medical analysis, or AI backend is connected.

type Role = 'patient' | 'guardian';
type Route = 'welcome' | 'login' | 'register' | 'dashboard';
type Tab = 'home' | 'medication' | 'ai' | 'services' | 'settings';
type Medication = { id: string; title: string; detail: string; time: string; taken: boolean };
type Chat = { id: number; sender: 'user' | 'assistant'; text: string };

const C = {
  blue: '#0056B3', blue2: '#1375DF', green: '#059669', navy: '#14243D',
  ink: '#1E293B', muted: '#64748B', subtle: '#94A3B8', bg: '#F4F7FB',
  line: '#E4EAF2', white: '#FFFFFF', danger: '#DC2626', pale: '#EAF4FF',
};
const seedMeds: Medication[] = [
  { id: '1', title: '아침 복약', detail: '처방받은 약 · 식후', time: '08:00', taken: true },
  { id: '2', title: '점심 복약', detail: '처방받은 약 · 식후', time: '13:00', taken: false },
  { id: '3', title: '저녁 복약', detail: '처방받은 약 · 식후', time: '19:00', taken: false },
];

function Chip({ text, kind = 'blue' }: { text: string; kind?: 'blue' | 'green' | 'red' | 'neutral' }) {
  const bg = { blue: '#E6F1FF', green: '#DCFCE7', red: '#FEE2E2', neutral: '#EDF2F7' }[kind];
  const color = { blue: C.blue, green: '#047857', red: C.danger, neutral: C.muted }[kind];
  return <View style={[s.chip, { backgroundColor: bg }]}><Text style={[s.chipText, { color }]}>{text}</Text></View>;
}
function Action({ label, onPress, outline = false, danger = false, small = false }: {
  label: string; onPress: () => void; outline?: boolean; danger?: boolean; small?: boolean;
}) {
  const color = danger ? C.danger : C.blue;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.action,
    { backgroundColor: outline ? C.white : color, borderColor: color, paddingVertical: small ? 11 : 15, opacity: pressed ? .78 : 1 }]}>
    <Text style={[s.actionText, { color: outline ? color : C.white, fontSize: small ? 13 : 16 }]}>{label}</Text>
  </Pressable>;
}
function Panel({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[s.panel, style]}>{children}</View>;
}
function TitleRow({ title, accessory }: { title: string; accessory?: string }) {
  return <View style={s.rowBetween}><Text style={s.sectionTitle}>{title}</Text>{accessory && <Text style={s.caption}>{accessory}</Text>}</View>;
}

export default function DrMAS() {
  const [route, setRoute] = useState<Route>('welcome');
  const [role, setRole] = useState<Role>('patient');
  const [tab, setTab] = useState<Tab>('home');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [meds, setMeds] = useState(seedMeds);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<Chat[]>([
    { id: 1, sender: 'assistant', text: '안녕하세요! Dr.MAS 상담 화면입니다. 현재는 AI 서버가 연결되지 않은 UI 미리보기예요.' },
  ]);
  const [sosLeft, setSosLeft] = useState<number | null>(null);
  const [sosNotice, setSosNotice] = useState(false);
  const [sosAcknowledged, setSosAcknowledged] = useState(false);
  const [sosDelay, setSosDelay] = useState(10);
  const messageCounter = useRef(2);
  const roleLabel = role === 'patient' ? '환자' : '보호자';
  const takenCount = meds.filter(m => m.taken).length;

  useEffect(() => {
    if (sosLeft === null) return;
    if (sosLeft === 0) {
      setSosLeft(null);
      setSosNotice(true);
      setSosAcknowledged(false);
      return;
    }
    const timer = setTimeout(() => setSosLeft(v => v === null ? null : Math.max(0, v - 1)), 1000);
    return () => clearTimeout(timer);
  }, [sosLeft]);

  function selectRole(next: Role) {
    setRole(next);
    setRoute('login');
    setTab('home');
    setPassword('');
    setConfirm('');
  }
  function submitAuth() {
    if (route === 'register' && !name.trim()) { Alert.alert('입력 확인', '이름을 입력해 주세요.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { Alert.alert('입력 확인', '올바른 이메일을 입력해 주세요.'); return; }
    if (password.length < 8) { Alert.alert('입력 확인', '비밀번호는 8자 이상 입력해 주세요.'); return; }
    if (route === 'register' && password !== confirm) { Alert.alert('입력 확인', '비밀번호가 일치하지 않습니다.'); return; }
    Alert.alert('인증 서버 연결 전', '입력 형식은 확인했지만 실제 계정 인증이나 생성은 아직 지원하지 않습니다. 아래 「화면 미리보기」를 사용해 주세요.');
  }
  function preview() {
    setPassword(''); setConfirm(''); setRoute('dashboard'); setTab('home');
  }
  function signOut() { setRoute('welcome'); setPassword(''); setConfirm(''); setTab('home'); }
  function toggleMedication(id: string) {
    setMeds(old => old.map(m => m.id === id ? { ...m, taken: !m.taken } : m));
  }
  function sendChat() {
    const text = chatInput.trim(); if (!text) return;
    setMessages(old => [...old, { id: messageCounter.current++, sender: 'user', text },
      { id: messageCounter.current++, sender: 'assistant', text: '지금은 AI API가 연결되지 않았습니다. 실제 건강 상담 기능을 연결하기 전까지 의료적 판단을 제공하지 않습니다. 응급 증상이 있다면 즉시 119에 연락하세요.' }]);
    setChatInput('');
  }
  function startSOS() {
    setSosNotice(false); setSosAcknowledged(false); setSosLeft(sosDelay);
  }
  const services = [
    { icon: '▤', title: '처방전 스캔', desc: '카메라 · OCR · 약품명 확인', tag: '연동 예정' },
    { icon: '⌖', title: '주변 병원 · 약국', desc: '위치 기반 의료기관 검색', tag: '연동 예정' },
    { icon: '♡', title: '건강 데이터', desc: 'Health Connect 연결', tag: '연동 예정' },
    { icon: '♧', title: '보호자 연결', desc: '초대 및 연결 승인', tag: '연동 예정' },
  ];

  function authScreen() {
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
        <View style={s.demoPanel}><Text style={s.demoTitle}>개발 중 · 앱 화면 미리보기</Text><Text style={s.caption}>아직 실제 회원가입 및 로그인 서버가 연결되지 않았습니다.</Text><Action label={`${roleLabel} 화면 미리보기 →`} onPress={preview} outline small /></View>
      </ScrollView>
    </KeyboardAvoidingView>;
  }

  function welcomeScreen() {
    return <ScrollView contentContainerStyle={[s.page, { flexGrow: 1, justifyContent: 'center' }]}>
      <View style={s.heroLogo}><Text style={s.heroHeart}>♥</Text><Text style={s.heroCross}>✚</Text></View>
      <Text style={[s.appName, { textAlign: 'center' }]}>Dr.MAS</Text>
      <Text style={[s.paragraph, { textAlign: 'center', marginTop: 12, lineHeight: 24 }]}>나의 건강을 지키고,{ '\n' }소중한 가족과 연결되는 공간</Text>
      <View style={[s.welcomePanel, { marginTop: 42 }]}><Text style={s.welcomeQuestion}>어떤 서비스로 시작할까요?</Text>
        <Pressable onPress={() => selectRole('patient')} style={({ pressed }) => [s.roleCard, { opacity: pressed ? .7 : 1 }]}>
          <View style={[s.roleIcon, { backgroundColor: '#EAF3FF' }]}><Text style={s.roleEmoji}>♡</Text></View>
          <View style={s.flex}><Text style={s.roleTitle}>환자로 시작하기</Text><Text style={s.caption}>복약 관리 · 건강 체크 · AI 상담</Text></View><Text style={s.chevron}>›</Text>
        </Pressable>
        <Pressable onPress={() => selectRole('guardian')} style={({ pressed }) => [s.roleCard, { opacity: pressed ? .7 : 1 }]}>
          <View style={[s.roleIcon, { backgroundColor: '#E0F7EB' }]}><Text style={[s.roleEmoji, { color: C.green }]}>♧</Text></View>
          <View style={s.flex}><Text style={s.roleTitle}>보호자로 시작하기</Text><Text style={s.caption}>가족 모니터링 · 긴급 알림</Text></View><Text style={s.chevron}>›</Text>
        </Pressable>
      </View>
      <Text style={[s.caption, { textAlign: 'center', marginTop: 25 }]}>Dr.MAS · Your Family Health Companion</Text>
    </ScrollView>;
  }

  function patientHome() {
    return <>
      <View style={s.greeting}><View style={s.flex}><Text style={s.overline}>건강한 하루를 응원해요 ☀</Text><Text style={s.h1}>오늘도 안녕하세요!</Text></View><View style={s.avatar}><Text style={{ fontSize: 22 }}>☺</Text></View></View>
      <View style={[s.hero, { backgroundColor: C.blue }]}>
        <View style={s.rowBetween}><Text style={s.heroTag}>오늘의 건강 브리핑</Text><Chip text="샘플 데이터" kind="neutral" /></View>
        <Text style={s.heroTitle}>작은 건강 습관이{ '\n' }큰 안심이 됩니다.</Text>
        <Text style={s.heroDesc}>건강 수치는 웨어러블 연결 전 예시입니다.</Text>
        <View style={s.heroMetrics}><View><Text style={s.metricLabel}>심박수</Text><Text style={s.metricValue}>72 <Text style={s.metricUnit}>bpm</Text></Text></View><View style={s.metricSeparator} /><View><Text style={s.metricLabel}>수면</Text><Text style={s.metricValue}>7.5 <Text style={s.metricUnit}>시간</Text></Text></View></View>
      </View>
      <View style={s.sectionGap}><TitleRow title="오늘의 복약 일정" accessory={`${takenCount}/${meds.length} 완료`} /><Panel>
        <View style={s.rowBetween}><Text style={s.bodyStrong}>오늘의 복약 진행률</Text><Chip text={`${Math.round(takenCount / meds.length * 100)}%`} kind="green" /></View>
        <View style={s.progressTrack}><View style={[s.progressFill, { width: `${takenCount / meds.length * 100}%` }]} /></View>
        {meds.map(m => <MedicineRow key={m.id} med={m} onPress={() => toggleMedication(m.id)} />)}
      </Panel></View>
      <View style={s.sectionGap}><TitleRow title="빠른 서비스" /><View style={s.tileGrid}>
        <QuickTile icon="▤" title="처방전 분석" subtitle="이미지로 간편하게" onPress={() => setTab('services')} />
        <QuickTile icon="✦" title="AI 건강 상담" subtitle="궁금한 건강 정보" onPress={() => setTab('ai')} />
        <QuickTile icon="⌖" title="병원 찾기" subtitle="가까운 의료기관" onPress={() => setTab('services')} />
        <QuickTile icon="◷" title="복약 관리" subtitle="일정 확인하기" onPress={() => setTab('medication')} />
      </View></View>
      <View style={s.sectionGap}><Panel style={{ borderColor: '#FECACA', backgroundColor: '#FFF7F7' }}><Text style={[s.sectionTitle, { color: C.danger }]}>긴급 SOS</Text><Text style={[s.paragraph, { marginVertical: 8 }]}>알림 흐름을 시험해 볼 수 있어요. 실제 신고나 보호자 연락은 전송되지 않습니다.</Text><Action label="SOS 시뮬레이션 시작" danger onPress={startSOS} /></Panel></View>
    </>;
  }
  function guardianHome() {
    return <>
      <View style={s.greeting}><View><Text style={s.overline}>소중한 가족을 위한 공간</Text><Text style={s.h1}>보호자 대시보드</Text></View><Chip text="미리보기" kind="neutral" /></View>
      {sosNotice && !sosAcknowledged && <Panel style={{ borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', marginBottom: 16 }}>
        <Text style={[s.sectionTitle, { color: C.danger }]}>⚠ SOS 테스트 알림</Text><Text style={[s.paragraph, { marginVertical: 10 }]}>같은 앱 안에서 발생한 테스트 이벤트입니다. 실제 푸시 알림은 아닙니다.</Text><Action label="테스트 알림 확인" onPress={() => setSosAcknowledged(true)} danger small />
      </Panel>}
      <Panel><View style={s.rowBetween}><Text style={s.sectionTitle}>연결된 가족</Text><Chip text="연결 전" kind="neutral" /></View>
        <View style={[s.row, { marginTop: 16 }]}><View style={[s.avatar, { backgroundColor: '#EDF4FC' }]}><Text style={{ fontSize: 23 }}>♡</Text></View><View style={s.flex}><Text style={s.bodyStrong}>환자 계정 연결이 필요해요</Text><Text style={s.caption}>승인된 계정만 건강 정보를 볼 수 있습니다.</Text></View></View>
        <View style={{ marginTop: 15 }}><Action label="가족 연결 기능 준비 중" outline small onPress={() => Alert.alert('연결 예정', '실제 보호자 연결 API 구현 후 사용 가능합니다.')} /></View>
      </Panel>
      <View style={s.sectionGap}><TitleRow title="모니터링 요약" /><View style={s.tileGrid}>
        <SummaryTile title="심박수" value="—" footer="기기 연결 전" />
        <SummaryTile title="최근 복약" value="—" footer="서버 연결 전" />
        <SummaryTile title="위치" value="—" footer="동의 필요" />
        <SummaryTile title="긴급 이벤트" value={sosNotice ? '1건' : '0건'} footer="현재 앱 테스트" />
      </View></View>
      <View style={s.sectionGap}><Panel><Text style={s.sectionTitle}>SOS 시연</Text><Text style={[s.paragraph, { marginVertical: 10 }]}>환자·보호자 화면을 같은 기기에서 전환해 테스트할 수 있습니다.</Text><Action label="환자 화면의 테스트 알림 만들기" onPress={startSOS} danger /></Panel></View>
    </>;
  }
  function medicationScreen() {
    return <><Text style={s.h1}>복약 관리</Text><Text style={[s.paragraph, { marginTop: 8, marginBottom: 22 }]}>오늘의 약 복용 상태를 확인해 보세요.</Text>
      <Panel style={{ backgroundColor: '#E9F8F1', borderColor: '#CEEFDC' }}><View style={s.rowBetween}><View><Text style={s.overline}>오늘의 복약 달성</Text><Text style={[s.bigValue, { color: C.green }]}>{takenCount} <Text style={s.caption}>/ {meds.length}회</Text></Text></View><Text style={{ fontSize: 35 }}>✓</Text></View><View style={s.progressTrack}><View style={[s.progressFill, { width: `${takenCount / meds.length * 100}%`, backgroundColor: C.green }]} /></View></Panel>
      <View style={s.sectionGap}><TitleRow title="복약 체크리스트" accessory="눌러서 상태 변경" /><Panel>{meds.map(m => <MedicineRow key={m.id} med={m} onPress={() => toggleMedication(m.id)} />)}</Panel></View>
      <View style={s.sectionGap}><Panel><Text style={s.bodyStrong}>처방전과 연동하기</Text><Text style={[s.paragraph, { marginTop: 7 }]}>향후 실제 OCR 분석 후 약품명을 확인하고 복용 스케줄을 등록할 수 있도록 연결할 예정입니다.</Text><View style={{ marginTop: 12 }}><Action label="처방전 기능 보기" outline small onPress={() => setTab('services')} /></View></Panel></View>
      <Text style={s.disclaimer}>현재 체크 상태는 앱을 종료하면 초기화됩니다. 의료진이 안내한 복약 지시를 우선하세요.</Text>
    </>;
  }
  function aiScreen() {
    return <><Text style={s.h1}>AI 건강 상담</Text><Text style={[s.paragraph, { marginTop: 8, marginBottom: 16 }]}>건강에 대한 궁금증을 편하게 남겨보세요.</Text>
      <View style={s.alertSoft}><Text style={s.alertSoftText}>ⓘ 현재는 대화 UI 테스트입니다. GPT API, 의료 문서 검색 및 출처 검증은 아직 연결되지 않았습니다.</Text></View>
      <Panel style={{ marginTop: 15, padding: 14 }}>
        {messages.map(m => <View key={m.id} style={[s.bubble, m.sender === 'user' ? s.bubbleUser : s.bubbleAssistant]}><Text style={{ color: m.sender === 'user' ? C.white : C.ink, fontSize: 14, lineHeight: 21 }}>{m.text}</Text></View>)}
      </Panel>
      <View style={[s.row, { alignItems: 'flex-end', marginTop: 14 }]}><TextInput multiline accessibilityLabel="건강 상담 메시지" style={[s.input, { flex: 1, minHeight: 52, maxHeight: 130, paddingTop: 12 }]} value={chatInput} onChangeText={setChatInput} placeholder="건강 관련 질문을 입력하세요" placeholderTextColor={C.subtle} /><View style={{ width: 78, marginLeft: 8 }}><Action label="전송" onPress={sendChat} small /></View></View>
      <Text style={s.disclaimer}>응급 증상이 있다면 상담 답변을 기다리지 말고 즉시 119 또는 의료기관에 연락하세요.</Text>
    </>;
  }
  function servicesScreen() {
    return <><Text style={s.h1}>건강 서비스</Text><Text style={[s.paragraph, { marginTop: 8, marginBottom: 18 }]}>기존 Dr.MAS 기능을 모바일 앱에 연결하고 있어요.</Text>
      {services.map(item => <Pressable key={item.title} onPress={() => Alert.alert(item.title, 'UI 구성은 준비됐으며 실제 기능은 외부 API 및 권한 연동 후 활성화됩니다.')} style={({ pressed }) => [s.serviceCard, { opacity: pressed ? .75 : 1 }]}>
        <View style={s.serviceIcon}><Text style={{ fontSize: 27, color: C.blue }}>{item.icon}</Text></View><View style={s.flex}><Text style={s.bodyStrong}>{item.title}</Text><Text style={[s.caption, { marginTop: 4 }]}>{item.desc}</Text><View style={{ marginTop: 9, alignSelf: 'flex-start' }}><Chip text={item.tag} kind="neutral" /></View></View><Text style={s.chevron}>›</Text>
      </Pressable>)}
      <View style={s.alertSoft}><Text style={s.alertSoftText}>의료 정보는 개인 민감정보이므로 서버 연동 전에는 실제 처방전·환자 데이터를 입력하지 마세요.</Text></View>
    </>;
  }
  function settingsScreen() {
    return <><Text style={s.h1}>설정</Text><Text style={[s.paragraph, { marginTop: 8, marginBottom: 24 }]}>계정 및 앱 설정을 관리합니다.</Text>
      <Panel><TitleRow title="현재 화면" /><View style={[s.rowBetween, { marginTop: 12 }]}><Text style={s.bodyStrong}>{roleLabel} 모드</Text><Chip text="체험용" /></View>
        <Text style={[s.caption, { marginTop: 12, marginBottom: 14 }]}>로그인 정보는 서버에 연결되거나 저장되지 않았습니다.</Text><Action label={role === 'patient' ? '보호자 화면 보기' : '환자 화면 보기'} outline small onPress={() => { setRole(v => v === 'patient' ? 'guardian' : 'patient'); setTab('home'); }} />
      </Panel>
      <View style={s.sectionGap}><Panel><TitleRow title="SOS 테스트 대기시간" accessory={`${sosDelay}초`} /><Text style={[s.caption, { marginVertical: 12 }]}>실제 알림 설정이 아닌 시뮬레이션용 설정입니다.</Text><View style={s.row}>{[10, 20, 30].map(n => <Pressable key={n} style={[s.delayChip, sosDelay === n && s.delaySelected]} onPress={() => setSosDelay(n)}><Text style={{ fontWeight: '700', color: sosDelay === n ? C.white : C.blue }}>{n}초</Text></Pressable>)}</View></Panel></View>
      <View style={s.sectionGap}><Panel><TitleRow title="안내" /><Text style={[s.paragraph, { marginTop: 12 }]}>Dr.MAS 모바일 졸업작품 개발 버전입니다. 실제 의료기기, 응급 구조 서비스 또는 진단 도구가 아닙니다.</Text></Panel></View>
      <View style={s.sectionGap}><Action label="첫 화면으로 돌아가기" outline onPress={signOut} /></View>
    </>;
  }

  const tabs: { key: Tab; icon: string; title: string }[] = [
    { key: 'home', icon: '⌂', title: '홈' },
    { key: 'medication', icon: '◷', title: '복약' },
    { key: 'ai', icon: '✦', title: 'AI 상담' },
    { key: 'services', icon: '▦', title: '서비스' },
    { key: 'settings', icon: '⚙', title: '설정' },
  ];
  return <SafeAreaView style={s.root} edges={['top', 'bottom']}>
    {route === 'welcome' ? welcomeScreen() : route !== 'dashboard' ? authScreen() : <>
      <View style={s.appHeader}><View style={s.row}><View style={s.smallBrand}><Text style={s.brandSymbol}>✚</Text></View><Text style={s.headerBrand}>Dr.MAS</Text></View><Chip text={`${roleLabel} · 미리보기`} kind="neutral" /></View>
      <ScrollView key={`${tab}-${role}`} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        {tab === 'home' ? (role === 'patient' ? patientHome() : guardianHome()) : tab === 'medication' ? medicationScreen() : tab === 'ai' ? aiScreen() : tab === 'services' ? servicesScreen() : settingsScreen()}
        <View style={{ height: 25 }} />
      </ScrollView>
      <View style={s.bottomNav}>{tabs.map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: tab === item.key }} onPress={() => setTab(item.key)} style={s.navItem}>
        <Text style={[s.navIcon, { color: tab === item.key ? C.blue : C.subtle }]}>{item.icon}</Text><Text style={[s.navLabel, { color: tab === item.key ? C.blue : C.subtle, fontWeight: tab === item.key ? '800' : '500' }]}>{item.title}</Text>
      </Pressable>)}</View>
    </>}
    {sosLeft !== null && <View style={s.overlay}><View style={s.sosDialog}><Text style={{ fontSize: 47, textAlign: 'center', color: C.white }}>⚠</Text><Text style={s.sosTitle}>SOS 테스트 진행 중</Text><Text style={s.sosNumber}>{sosLeft}</Text><Text style={s.sosBody}>카운트다운 종료 시 앱 내부에 테스트 알림 상태만 생성됩니다. 실제 보호자 연락이나 119 신고는 전송되지 않습니다.</Text>
      <Action label="테스트 취소하기" onPress={() => setSosLeft(null)} outline /></View></View>}
  </SafeAreaView>;
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return <View style={s.field}><Text style={s.fieldLabel}>{label}</Text><TextInput {...inputProps} style={s.input} placeholderTextColor={C.subtle} /></View>;
}
function MedicineRow({ med, onPress }: { med: Medication; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: med.taken }} onPress={onPress} style={s.medRow}>
    <View style={[s.checkBox, med.taken && s.checked]}><Text style={{ color: C.white, fontWeight: '900' }}>{med.taken ? '✓' : ''}</Text></View>
    <View style={s.flex}><Text style={s.bodyStrong}>{med.title}</Text><Text style={s.caption}>{med.detail}</Text></View>
    <View style={{ alignItems: 'flex-end', gap: 4 }}><Text style={s.timeText}>{med.time}</Text><Text style={{ fontSize: 11, color: med.taken ? C.green : C.subtle }}>{med.taken ? '완료' : '예정'}</Text></View>
  </Pressable>;
}
function QuickTile({ icon, title, subtitle, onPress }: { icon: string; title: string; subtitle: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [s.tile, { opacity: pressed ? .75 : 1 }]}><View style={s.tileIcon}><Text style={{ color: C.blue, fontSize: 25 }}>{icon}</Text></View><Text style={s.bodyStrong}>{title}</Text><Text style={[s.caption, { marginTop: 5 }]}>{subtitle}</Text></Pressable>;
}
function SummaryTile({ title, value, footer }: { title: string; value: string; footer: string }) {
  return <View style={s.tile}><Text style={s.caption}>{title}</Text><Text style={[s.bigValue, { marginVertical: 5 }]}>{value}</Text><Text style={s.caption}>{footer}</Text></View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, flex: { flex: 1 }, page: { padding: 20, paddingBottom: 30 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  chip: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' }, chipText: { fontSize: 11, fontWeight: '800' },
  action: { borderWidth: 1.5, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, minHeight: 44 }, actionText: { fontWeight: '800', textAlign: 'center' },
  panel: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 19, padding: 18 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: C.ink }, sectionGap: { marginTop: 24 },
  caption: { fontSize: 12, color: C.muted, lineHeight: 18 }, paragraph: { fontSize: 14, color: C.muted, lineHeight: 22 }, bodyStrong: { fontSize: 14, fontWeight: '800', color: C.ink },
  h1: { fontSize: 26, fontWeight: '900', color: C.navy, letterSpacing: -.7 }, overline: { color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 7 },
  chipTextAlt: { color: C.blue }, brandMark: { height: 58, width: 58, backgroundColor: C.blue, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  brandSymbol: { color: C.white, fontSize: 26, fontWeight: '900' }, back: { alignSelf: 'flex-start', paddingVertical: 10, marginBottom: 15 }, backText: { fontSize: 14, fontWeight: '700', color: C.blue },
  field: { marginBottom: 17 }, fieldLabel: { fontSize: 13, fontWeight: '800', color: C.ink, marginBottom: 8 }, input: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: '#D6E1EC', backgroundColor: C.white, paddingHorizontal: 14, fontSize: 15, color: C.ink }, link: { color: C.blue, fontWeight: '700', fontSize: 13 },
  demoPanel: { marginTop: 18, backgroundColor: '#E8F3FF', padding: 16, borderRadius: 15, gap: 9 }, demoTitle: { fontSize: 13, fontWeight: '800', color: C.blue },
  heroLogo: { alignSelf: 'center', height: 116, width: 116, borderRadius: 32, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  heroHeart: { color: C.white, fontSize: 65, lineHeight: 89 }, heroCross: { position: 'absolute', color: C.white, fontSize: 20, fontWeight: '900', top: 44 },
  appName: { fontSize: 44, fontWeight: '900', color: C.navy, letterSpacing: -.6 }, welcomePanel: { backgroundColor: C.white, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.line },
  welcomeQuestion: { fontSize: 17, fontWeight: '800', color: C.ink, marginBottom: 16 }, roleCard: { flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: C.line, borderRadius: 15, padding: 12, marginBottom: 11 },
  roleIcon: { height: 53, width: 53, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, roleEmoji: { fontSize: 29, color: C.blue }, roleTitle: { fontSize: 16, fontWeight: '800', color: C.ink, marginBottom: 5 }, chevron: { fontSize: 27, color: C.subtle },
  appHeader: { backgroundColor: C.white, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  smallBrand: { height: 33, width: 33, borderRadius: 9, backgroundColor: C.blue, justifyContent: 'center', alignItems: 'center' }, headerBrand: { fontSize: 19, fontWeight: '900', color: C.navy },
  greeting: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }, avatar: { height: 47, width: 47, borderRadius: 16, backgroundColor: '#E9F1FA', justifyContent: 'center', alignItems: 'center' },
  hero: { borderRadius: 22, padding: 20 }, heroTag: { color: '#D1E5FF', fontWeight: '800', fontSize: 12 }, heroTitle: { fontSize: 22, fontWeight: '900', color: C.white, lineHeight: 30, marginTop: 18 }, heroDesc: { color: '#D2E7FF', fontSize: 12, lineHeight: 18, marginTop: 9 },
  heroMetrics: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,.12)', borderRadius: 14, padding: 15, marginTop: 20, alignItems: 'center', justifyContent: 'space-around' }, metricLabel: { color: '#DEEDFF', fontSize: 12 }, metricValue: { color: C.white, fontSize: 24, fontWeight: '900', marginTop: 5 }, metricUnit: { fontSize: 12, fontWeight: '600' }, metricSeparator: { width: 1, height: 40, backgroundColor: '#7EADE3' },
  progressTrack: { height: 9, backgroundColor: '#DFE9F4', borderRadius: 10, overflow: 'hidden', marginTop: 15, marginBottom: 9 }, progressFill: { height: 9, backgroundColor: C.blue, borderRadius: 10 },
  medRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, gap: 12, borderBottomWidth: 1, borderBottomColor: '#EDF1F6' }, checkBox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: C.green, borderColor: C.green }, timeText: { color: C.ink, fontWeight: '800', fontSize: 13 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }, tile: { width: '48%', backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 17, padding: 15, minHeight: 115 }, tileIcon: { backgroundColor: '#EAF3FF', height: 40, width: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  bigValue: { fontSize: 33, fontWeight: '900', color: C.navy }, disclaimer: { fontSize: 11, color: C.muted, lineHeight: 18, marginTop: 18, textAlign: 'center' },
  alertSoft: { backgroundColor: '#E8F3FF', borderRadius: 13, padding: 14, marginTop: 15 }, alertSoftText: { color: '#275785', fontSize: 12, lineHeight: 19, fontWeight: '600' },
  bubble: { padding: 13, borderRadius: 15, marginBottom: 10, maxWidth: '92%' }, bubbleUser: { backgroundColor: C.green, alignSelf: 'flex-end', borderBottomRightRadius: 4 }, bubbleAssistant: { backgroundColor: '#EFF4F8', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  serviceCard: { backgroundColor: C.white, borderRadius: 17, borderWidth: 1, borderColor: C.line, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 12 }, serviceIcon: { width: 51, height: 51, borderRadius: 14, backgroundColor: '#EDF5FF', alignItems: 'center', justifyContent: 'center' },
  bottomNav: { flexDirection: 'row', backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8, paddingBottom: 5 }, navItem: { flex: 1, alignItems: 'center', paddingVertical: 5, gap: 2 }, navIcon: { fontSize: 23, fontWeight: '800' }, navLabel: { fontSize: 10 },
  delayChip: { backgroundColor: C.white, borderRadius: 9, paddingVertical: 12, flex: 1, borderWidth: 1, borderColor: '#CDE3FF', alignItems: 'center' }, delaySelected: { backgroundColor: C.blue },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(9,19,36,.82)', justifyContent: 'center', padding: 24, zIndex: 100 }, sosDialog: { backgroundColor: C.danger, borderRadius: 23, padding: 24 }, sosTitle: { color: C.white, fontSize: 23, fontWeight: '900', textAlign: 'center', marginTop: 12 }, sosNumber: { color: C.white, fontSize: 73, fontWeight: '900', textAlign: 'center', marginVertical: 12 }, sosBody: { color: '#FEE2E2', lineHeight: 21, textAlign: 'center', fontSize: 13, marginBottom: 23 },
});
