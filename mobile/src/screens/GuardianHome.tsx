import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SosPanel } from '../components/SosPanel';
import { ConnectedFamilySummary } from '../components/DashboardSummaries';
import { useDrMAS } from '../features/app/context';
import { Action, AppIcon, C, SummaryTile, TitleRow, s } from '../components/ui';
import { HealthNewsCarousel } from '../components/HealthNewsCarousel';
import { loadRegisteredHealthNews } from '../services/registeredHealthNews';

export default function GuardianHome() {
  const { user, setTab } = useDrMAS();
  const router = useRouter();
  return <>
    <View style={s.greeting}><View style={s.flex}><Text style={s.overline}>가족의 건강 일상</Text><Text style={s.h1}>{user?.name?.trim() ? `${user.name.trim()} 님,` : '안녕하세요,'}{'\n'}함께 돌보는 하루</Text><Text style={[s.caption,{marginTop:6}]}>승인된 가족의 소식을 확인하세요.</Text></View><View style={s.avatar}><AppIcon name="family" size={26} /></View></View>
    <View style={[s.hero, { backgroundColor: C.green, borderRadius:24,padding:24 }]}>
      <View style={s.row}><AppIcon name="family" color={C.mint} /><Text style={[s.sectionTitle,{color:C.white}]}>보호자 관제 센터</Text></View>
      <Text style={[s.paragraph, { marginTop: 12,color:C.white }]}>환자의 동의로 연결해요</Text>
      <Text style={[s.caption, { marginTop: 4,color:C.white }]}>가족의 승인을 받으면 허용된 정보를 확인할 수 있어요.</Text>
      <View style={{ marginTop: 12 }}><Action label="가족 연결 관리" small outline onPress={() => setTab('settings')} /></View>
    </View>
    <View style={s.sectionGap}><TitleRow title="연결된 가족" accessory="개인정보 보호" />{user && <ConnectedFamilySummary key={user.id} guardianId={user.id} onManage={() => setTab('settings')} onMedication={() => setTab('medication')} />}</View>
    {user && <SosPanel key={user.id} actor={{ id: user.id, role: 'guardian' }} compact />}
    <View style={[s.panel, s.sectionGap]}><TitleRow title="가족 건강 대시보드" accessory="연결 · 동의 기반" /><View style={s.tileGrid}>
      <SummaryTile title="심박수" value="—" footer="공유된 측정값 없음" />
      <SummaryTile title="복약 상태" value="—" footer="가족 복약 조회에서 확인" />
      <SummaryTile title="최근 위치" value="—" footer="위치 공유 동의 전" />
    </View><Text style={[s.caption, { marginTop: 12 }]}>승인된 정보만 조회합니다. 가족의 실제 측정값이 전달되지 않은 항목은 표시하지 않아요.</Text></View>
    <View style={[s.sectionGap, { gap: 10 }]}><Action label="가족 건강·웨어러블 상태" outline onPress={() => router.push('/health')} /><Action label="낙상·원격 설정 화면" outline onPress={() => router.push('/fall')} /></View>
    <View style={[s.panel, { backgroundColor: C.pale, marginTop: 24, gap: 12 }]}><AppIcon name="assistant" /><Text style={s.sectionTitle}>AI 건강정보 상담</Text><Text style={s.paragraph}>등록된 공식 자료의 원문과 출처를 찾아보세요. 가족의 상담 기록은 공유되지 않아요.</Text><Action label="AI 건강 상담 시작" onPress={() => setTab('ai')} /></View>
    <HealthNewsCarousel key={`news:${user?.id}`} onMore={() => setTab('ai')} loadItems={loadRegisteredHealthNews} />
  </>;
}
