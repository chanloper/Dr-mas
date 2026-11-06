import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SosPanel } from '../components/SosPanel';
import { ConnectedFamilySummary } from '../components/DashboardSummaries';
import { useDrMAS } from '../features/app/context';
import { Action, C, Chip, SummaryTile, TitleRow, s } from '../components/ui';

export default function GuardianHome() {
  const { user, setTab } = useDrMAS();
  const router = useRouter();
  return <>
    <View style={s.greeting}><View style={s.flex}><Text style={s.overline}>가족과 함께하는 건강 관리</Text><Text style={s.h1}>가족의 안심을 함께 ♡</Text><Text style={[s.paragraph, { marginTop: 5 }]}>오늘의 가족 건강을 한눈에 확인해요.</Text></View></View>
    <View style={[s.hero, { backgroundColor: '#087D70' }]}>
      <View style={s.rowBetween}><Text style={s.heroTag}>가족 연결</Text><Chip text="동의 기반 연결" kind="neutral" /></View>
      <Text style={s.heroTitle}>가족의 건강을{ '\n' }따뜻하게 지켜주세요.</Text>
      <Text style={s.heroDesc}>설정의 연결 관리에서 환자의 승인을 요청하고 연결 상태를 확인하세요.</Text>
      <View style={[s.heroMetrics, { justifyContent: 'flex-start' }]}><Text style={{ color: C.white, fontWeight: '700', lineHeight: 21 }}>♡ 환자 본인의 승인이 필요해요.{ '\n' }연결 관리에서 승인 상태를 확인하세요.</Text></View>
    </View>
    <View style={s.sectionGap}><TitleRow title="연결된 가족" accessory="개인정보 보호" />{user && <ConnectedFamilySummary key={user.id} guardianId={user.id} onManage={() => setTab('settings')} onMedication={() => setTab('medication')} />}</View>
    {user && <SosPanel key={user.id} actor={{ id: user.id, role: 'guardian' }} />}
    <View style={s.sectionGap}><TitleRow title="가족 건강 정보" accessory="연결 · 동의 기반" /><View style={s.tileGrid}>
      <SummaryTile title="심박수" value="—" footer="웨어러블 연결 전" />
      <SummaryTile title="복약 상태" value="—" footer="가족 복약 조회에서 확인" />
      <SummaryTile title="최근 위치" value="—" footer="위치 공유 동의 전" />
    </View></View>
    <View style={[s.sectionGap, { gap: 10 }]}><Action label="가족 건강·웨어러블 상태" outline onPress={() => router.push('/health')} /><Action label="낙상·원격 설정 화면" outline onPress={() => router.push('/fall')} /></View>
  </>;
}
