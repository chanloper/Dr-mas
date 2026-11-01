import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { Action, C, Chip, MedicineRow, Panel, QuickTile, TitleRow, s } from '../components/ui';

export default function PatientHome() {
  const { meds, takenCount, toggleMedication, setTab, startSOS } = useDrMAS();
  const progress = meds.length ? Math.round((takenCount / meds.length) * 100) : 0;
  return <>
    <View style={s.greeting}>
      <View style={s.flex}>
        <Text style={s.overline}>YOUR WELLNESS, EVERY DAY</Text>
        <Text style={s.h1}>오늘도 건강하게 👋</Text>
        <Text style={[s.paragraph, { marginTop: 5 }]}>작은 실천이 건강한 하루를 만들어요.</Text>
      </View>
      <View style={s.avatar}><Text style={{ fontSize: 23, color: C.blue }}>♡</Text></View>
    </View>

    <View style={[s.hero, { backgroundColor: C.blue, overflow: 'hidden' }]}>
      <View style={{ position: 'absolute', width: 185, height: 185, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.07)', right: -65, top: -90 }} />
      <View style={{ position: 'absolute', width: 130, height: 130, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.06)', right: -35, bottom: -75 }} />
      <View style={s.rowBetween}><Text style={s.heroTag}>✦ TODAY'S HEALTH</Text><Chip text="예시 데이터" kind="neutral" /></View>
      <Text style={s.heroTitle}>나를 돌보는 시간,{ '\n' }지금 시작해요.</Text>
      <Text style={s.heroDesc}>건강 지표는 기기 연동 전 샘플 정보입니다.</Text>
      <View style={s.heroMetrics}>
        <View style={s.flex}><Text style={s.metricLabel}>♡ 심박수</Text><Text style={s.metricValue}>72 <Text style={s.metricUnit}>bpm</Text></Text><Text style={[s.metricLabel, { marginTop: 4 }]}>샘플 측정값</Text></View>
        <View style={s.metricSeparator} />
        <View style={s.flex}><Text style={s.metricLabel}>☾ 수면 시간</Text><Text style={s.metricValue}>7.5 <Text style={s.metricUnit}>시간</Text></Text><Text style={[s.metricLabel, { marginTop: 4 }]}>샘플 측정값</Text></View>
      </View>
    </View>

    <View style={s.sectionGap}>
      <TitleRow title="오늘의 복약" accessory={`${takenCount} / ${meds.length} 완료`} />
      <Panel>
        <View style={s.rowBetween}>
          <View style={s.flex}><Text style={s.bodyStrong}>{progress === 100 ? '오늘의 복약을 모두 완료했어요! 🎉' : '복약을 하나씩 완료해 보세요'}</Text><Text style={[s.caption, { marginTop: 4 }]}>체크하면 진행률이 바로 반영돼요</Text></View>
          <View style={{ width: 59, height: 59, borderRadius: 30, backgroundColor: '#E5F6EF', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#047857', fontWeight: '900', fontSize: 17 }}>{progress}%</Text></View>
        </View>
        <View style={s.progressTrack}><View style={[s.progressFill, { width: `${progress}%`, backgroundColor: C.green }]} /></View>
        {meds.map(m => <MedicineRow key={m.id} med={m} onPress={() => toggleMedication(m.id)} />)}
        <Pressable onPress={() => setTab('medication')} accessibilityRole="button" style={{ alignSelf: 'center', padding: 11, marginTop: 6 }}><Text style={{ color: C.blue, fontWeight: '800' }}>복약 관리 자세히 보기  →</Text></Pressable>
      </Panel>
    </View>

    <View style={s.sectionGap}>
      <TitleRow title="빠른 서비스" accessory="자주 사용하는 기능" />
      <View style={s.tileGrid}>
        <QuickTile icon="▤" title="처방전 분석" subtitle="촬영·분석 기능 준비 중" onPress={() => setTab('services')} />
        <QuickTile icon="✧" title="AI 건강 상담" subtitle="상담 서비스 연결 전" onPress={() => setTab('ai')} />
        <QuickTile icon="⌖" title="병원 찾기" subtitle="주변 의료기관 연결 예정" onPress={() => setTab('services')} />
        <QuickTile icon="◷" title="복약 관리" subtitle="오늘의 복약 체크" onPress={() => setTab('medication')} />
      </View>
    </View>
    <View style={s.sectionGap}>
      <Panel style={{ backgroundColor: '#FFF7F7', borderColor: '#FDD5D5' }}>
        <View style={s.row}><View style={{ backgroundColor: '#FEE2E2', padding: 12, borderRadius: 13 }}><Text style={{ fontSize: 21, color: C.danger }}>!</Text></View><View style={s.flex}><Text style={[s.sectionTitle, { color: '#B91C1C' }]}>긴급 상황 SOS</Text><Text style={s.caption}>실제 알림 발송 없이 흐름을 체험해요</Text></View></View>
        <Text style={[s.paragraph, { marginTop: 12, marginBottom: 14 }]}>현재 이 기기의 알림 상태만 변경됩니다. 119 신고나 보호자 연락은 이루어지지 않습니다.</Text>
        <Action label="SOS 알림 시작" onPress={startSOS} danger />
      </Panel>
    </View>
  </>;
}
