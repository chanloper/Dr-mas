import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { Action, C, Chip, MedicineRow, Panel, QuickTile, TitleRow, s } from '../components/ui';
import { PatientMedicationSummary } from '../components/DashboardSummaries';
import { SosPanel } from '../components/SosPanel';
import { MedicationStatus } from '../components/MedicationStatus';

export default function PatientHome() {
  const router = useRouter();
  const { meds, medsReady, medsSaving, takenCount, toggleMedication, setTab, user, sosDelay } = useDrMAS();
  const progress = meds.length ? Math.round((takenCount / meds.length) * 100) : 0;
  const [showLocal, setShowLocal] = useState(false);
  return <>
    <View style={s.greeting}>
      <View style={s.flex}>
        <Text style={s.overline}>매일 함께하는 건강 관리</Text>
        <Text style={s.h1}>오늘도 건강하게 👋</Text>
        <Text style={[s.paragraph, { marginTop: 5 }]}>작은 실천이 건강한 하루를 만들어요.</Text>
      </View>
      <View style={s.avatar}><Text style={{ fontSize: 23, color: C.blue }}>♡</Text></View>
    </View>

    <View style={[s.hero, { backgroundColor: C.blue, overflow: 'hidden' }]}>
      <View style={{ position: 'absolute', width: 185, height: 185, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.07)', right: -65, top: -90 }} />
      <View style={{ position: 'absolute', width: 130, height: 130, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.06)', right: -35, bottom: -75 }} />
      <View style={s.rowBetween}><Text style={s.heroTag}>✦ 오늘의 건강</Text><Chip text="건강 지표 미연동" kind="neutral" /></View>
      <Text style={s.heroTitle}>나를 돌보는 시간,{ '\n' }지금 시작해요.</Text>
      <Text style={s.heroDesc}>기기에서 측정한 건강 정보가 아직 없습니다.</Text>
      <View style={s.heroMetrics}>
        <View style={s.flex}><Text style={s.metricLabel}>♡ 심박수</Text><Text style={s.metricValue}>— <Text style={s.metricUnit}>bpm</Text></Text><Text style={[s.metricLabel, { marginTop: 4 }]}>측정 정보 없음</Text></View>
        <View style={s.metricSeparator} />
        <View style={s.flex}><Text style={s.metricLabel}>☾ 수면 시간</Text><Text style={s.metricValue}>— <Text style={s.metricUnit}>시간</Text></Text><Text style={[s.metricLabel, { marginTop: 4 }]}>측정 정보 없음</Text></View>
      </View>
    </View>

    {user && <PatientMedicationSummary key={user.id} user={user} onOpen={() => setTab('medication')} />}
    {user && <SosPanel key={user.id} actor={{ id: user.id, role: 'patient' }} delay={sosDelay} />}
    <View style={s.sectionGap}><Action label={showLocal ? '기기의 예시 복약 접기' : '기기의 예시 복약 펼치기'} outline small onPress={() => setShowLocal(v => !v)} /><Text style={[s.caption, { marginTop: 8 }]}>예시 체크는 계정의 실제 복약 일정과 별개입니다.</Text></View>
    {showLocal && <View style={s.sectionGap}>
      <TitleRow title="이 기기의 예시 복약" accessory={`${takenCount} / ${meds.length} 완료`} />
      <Panel>
        <View style={s.rowBetween}>
          <View style={s.flex}><Text style={s.bodyStrong}>{progress === 100 ? '오늘의 복약을 모두 완료했어요! 🎉' : '복약을 하나씩 완료해 보세요'}</Text><Text style={[s.caption, { marginTop: 4 }]}>체크하면 진행률이 바로 반영돼요</Text></View>
          <View style={{ width: 59, height: 59, borderRadius: 30, backgroundColor: '#E5F6EF', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#047857', fontWeight: '900', fontSize: 17 }}>{progress}%</Text></View>
        </View>
        <View style={s.progressTrack}><View style={[s.progressFill, { width: `${progress}%`, backgroundColor: C.green }]} /></View>
        <MedicationStatus />
        {meds.map(m => <MedicineRow key={m.id} med={m} disabled={!medsReady || medsSaving} onPress={() => toggleMedication(m.id)} />)}
        <Pressable onPress={() => setTab('medication')} accessibilityRole="button" style={{ alignSelf: 'center', padding: 11, marginTop: 6 }}><Text style={{ color: C.blue, fontWeight: '800' }}>복약 관리 자세히 보기  →</Text></Pressable>
      </Panel>
    </View>}

    <View style={s.sectionGap}>
      <TitleRow title="빠른 서비스" accessory="자주 사용하는 기능" />
      <View style={s.tileGrid}>
        <QuickTile icon="▤" title="처방전·의약품" subtitle="이미지 선택 · 약품 확인 · DUR" onPress={() => router.push('/prescription')} />
        <QuickTile icon="✧" title="AI 건강 상담" subtitle="확인된 자료 기반 안내" onPress={() => setTab('ai')} />
        <QuickTile icon="⌖" title="병원 찾기" subtitle="현재 위치 · 키워드 검색" onPress={() => router.push('/places')} />
        <QuickTile icon="◷" title="복약 관리" subtitle="계정 일정 · 기기 기록" onPress={() => setTab('medication')} />
        <QuickTile icon="♡" title="건강·웨어러블" subtitle="연결 상태 · 측정 정보" onPress={() => router.push('/health')} />
        <QuickTile icon="⚠" title="낙상·SOS 설정" subtitle="감지 준비 · 대기·취소" onPress={() => router.push('/fall')} />
      </View>
    </View>
  </>;
}
