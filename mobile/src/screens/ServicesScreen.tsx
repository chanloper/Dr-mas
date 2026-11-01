import React from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { Action, C, Chip, Field, MedicineRow, Panel, QuickTile, SummaryTile, TitleRow, s } from '../components/ui';

export default function ServicesScreen() {
  const { route, setRoute, role, setRole, tab, setTab, name, setName, email, setEmail, password, setPassword, confirm, setConfirm, showPassword, setShowPassword, meds, messages, chatInput, setChatInput, sosLeft, setSosLeft, sosNotice, sosAcknowledged, setSosAcknowledged, sosDelay, setSosDelay, roleLabel, takenCount, selectRole, submitAuth, preview, signOut, toggleMedication, sendChat, startSOS } = useDrMAS();
    const services = [
    { icon: '▤', title: '처방전 스캔', desc: '카메라 · OCR · 약품명 확인', tag: '연동 예정' },
    { icon: '⌖', title: '주변 병원 · 약국', desc: '위치 기반 의료기관 검색', tag: '연동 예정' },
    { icon: '♡', title: '건강 데이터', desc: 'Health Connect 연결', tag: '연동 예정' },
    { icon: '♧', title: '보호자 연결', desc: '초대 및 연결 승인', tag: '연동 예정' },
  ];
  return <><Text style={s.h1}>건강 서비스</Text><Text style={[s.paragraph, { marginTop: 8, marginBottom: 18 }]}>기존 Dr.MAS 기능을 모바일 앱에 연결하고 있어요.</Text>
      {services.map(item => <Pressable key={item.title} onPress={() => Alert.alert(item.title, 'UI 구성은 준비됐으며 실제 기능은 외부 API 및 권한 연동 후 활성화됩니다.')} style={({ pressed }) => [s.serviceCard, { opacity: pressed ? .75 : 1 }]}>
        <View style={s.serviceIcon}><Text style={{ fontSize: 27, color: C.blue }}>{item.icon}</Text></View><View style={s.flex}><Text style={s.bodyStrong}>{item.title}</Text><Text style={[s.caption, { marginTop: 4 }]}>{item.desc}</Text><View style={{ marginTop: 9, alignSelf: 'flex-start' }}><Chip text={item.tag} kind="neutral" /></View></View><Text style={s.chevron}>›</Text>
      </Pressable>)}
      <View style={s.alertSoft}><Text style={s.alertSoftText}>의료 정보는 개인 민감정보이므로 서버 연동 전에는 실제 처방전·환자 데이터를 입력하지 마세요.</Text></View>
    </>;
  }
