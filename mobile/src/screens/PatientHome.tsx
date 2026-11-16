import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Text, View } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { Action, AppIcon, C, Panel, s } from '../components/ui';
import { PatientMedicationSummary, PatientConnectionsSummary } from '../components/DashboardSummaries';
import { HealthNewsCarousel } from '../components/HealthNewsCarousel';
import { useRouter } from 'expo-router';
import { loadRegisteredHealthNews } from '../services/registeredHealthNews';

export default function PatientHome() {
  const { setTab, user } = useDrMAS();
  const router = useRouter();
  const [fade] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let mounted = true;
    let animation: Animated.CompositeAnimation | undefined;
    const enter = (reduced: boolean) => {
      if (!mounted) return;
      if (reduced) { fade.setValue(1); return; }
      animation = Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' });
      animation.start();
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(enter).catch(() => { if (mounted) fade.setValue(1); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => {
      if (reduced) { animation?.stop(); fade.setValue(1); }
    });
    return () => { mounted = false; animation?.stop(); subscription.remove(); };
  }, [fade]);
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  return <Animated.View style={{ opacity: fade, paddingBottom: 32 }}>
    <View style={{ gap: 4, paddingVertical: 4 }}>
      <Text style={s.h1}>{user?.name?.trim() ? `${user.name.trim()} 님, 안녕하세요` : '안녕하세요'}</Text>
      <Text style={s.caption}>{today}</Text>
    </View>
    <View style={{ marginTop: 20 }}>
      <Panel style={{ backgroundColor: C.dark, borderColor: C.dark }}>
        <View style={s.rowBetween}>
          <View style={s.row}><AppIcon name="pulse" color={C.mint} size={24} /><Text accessibilityRole="header" style={[s.sectionTitle, { color: C.onDark }]}>나의 건강 대시보드</Text></View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
          <View style={{ flexGrow: 1, flexBasis: 116, minWidth: 0, padding: 16, borderRadius: 12, backgroundColor: '#344153' }}>
            <View style={s.rowBetween}><Text style={[s.bodyStrong, { color: C.onDark }]}>심박수</Text><AppIcon name="pulse" color={C.mint} /></View>
            <View style={[s.row, { marginTop: 8 }]}><Text style={[s.bigValue, { color: C.mint }]}>—</Text><Text style={[s.caption, { color: C.onDark }]}>bpm</Text></View>
            <Text style={[s.caption, { color: C.onDark }]}>측정값 없음</Text>
          </View>
          <View style={{ flexGrow: 1, flexBasis: 116, minWidth: 0, padding: 16, borderRadius: 12, backgroundColor: '#344153' }}>
            <View style={s.rowBetween}><Text style={[s.bodyStrong, { color: C.onDark }]}>수면 시간</Text><AppIcon name="sleep" color={C.onDark} /></View>
            <View style={[s.row, { marginTop: 8 }]}><Text style={[s.bigValue, { color: C.onDark }]}>—</Text><Text style={[s.caption, { color: C.onDark }]}>시간</Text></View>
            <Text style={[s.caption, { color: C.onDark }]}>측정값 없음</Text>
          </View>
        </View>
        <Text style={[s.caption, { marginTop: 12, color: C.onDark }]}>이 대시보드에 수집된 측정값이 없어요. 실제 측정과 가상 데이터를 구분해 확인하세요.</Text>
        <View style={{ marginTop: 12 }}><Action label="건강 데이터 확인" small outline onPress={() => router.push('/health')} /></View>
      </Panel>
    </View>
    {user && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 20 }}>
      <View style={{ flexGrow: 1, flexBasis: '44%', minWidth: 132 }}><PatientMedicationSummary key={`medication:${user.id}`} user={user} compact onOpen={() => setTab('medication')} /></View>
      <View style={{ flexGrow: 1, flexBasis: '44%', minWidth: 132 }}><PatientConnectionsSummary key={`family:${user.id}`} patientId={user.id} compact onManage={() => setTab('settings')} /></View>
    </View>}
    <View style={{ marginTop: 24 }}>
      <Panel style={{ backgroundColor: C.container, borderWidth: 0 }}>
        <View style={s.row}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }}><AppIcon name="assistant" color={C.white} size={25} /></View>
          <View style={{ flex: 1, minWidth: 0 }}><Text style={s.sectionTitle}>Dr.MAS 건강지킴이</Text><Text style={s.caption}>공식 자료 기반 건강정보 상담</Text></View>
        </View>
        <Text style={[s.paragraph, { marginTop: 12 }]}>궁금한 건강정보를 물어보세요. 등록된 근거와 출처를 찾아드려요.</Text>
        <View style={{ marginTop: 12 }}><Action label="AI 건강 상담 시작" pressScale onPress={() => setTab('ai')} /></View>
      </Panel>
    </View>
    <HealthNewsCarousel key={`news:${user?.id}`} onMore={() => setTab('ai')} loadItems={loadRegisteredHealthNews} />
  </Animated.View>;
}
