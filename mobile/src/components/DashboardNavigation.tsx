import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useDrMAS } from '../features/app/context';
import { Action, AppIcon, C, s } from './ui';
import { FeatureModal } from './FeatureModal';
import { PublicMedicineInfo } from './PublicMedicineInfo';
import { HealthNewsCarousel } from './HealthNewsCarousel';
import { SosPanel } from './SosPanel';
import type { Tab } from '../features/app/types';

type Destination = { title: string; description: string; icon: string; tab?: Tab; href?: Href; feature?: 'medicine' | 'news' | 'history' };
export const dashboardDestinations: readonly Destination[] = [
  { title: '복약 관리', description: '오늘의 일정과 복약 기록', icon: 'medication', tab: 'medication' },
  { title: '가족 연결 관리', description: '연결 요청 · 승인 · 해제', icon: 'family', tab: 'settings' },
  { title: '웨어러블 건강관리', description: '실제 연동과 가상 시뮬레이션 구분', icon: 'pulse', href: '/health' },
  { title: '병원 찾기', description: '위치·지역 검색과 지도', icon: 'places', href: { pathname: '/places', params: { category: 'hospital' } } },
  { title: '약국 찾기', description: '약국 검색과 지도', icon: 'places', href: { pathname: '/places', params: { category: 'pharmacy' } } },
  { title: '의약품 정보 검색', description: '식약처 공식 제품 정보 · 약 추천 아님', icon: 'prescription', feature: 'medicine' },
  { title: 'AI 건강정보 상담', description: '등록 자료 검색과 원문 출처', icon: 'assistant', tab: 'ai' },
  { title: '상담 기록', description: '동의한 현재 로그인 세션의 기록', icon: 'assistant', feature: 'history' },
  { title: '공식 건강정보', description: '검토된 홈 건강정보 · 미등록 시 준비 중', icon: 'health', feature: 'news' },
  { title: '처방전', description: '기존 처방전·의약품 화면', icon: 'prescription', href: '/prescription' },
  { title: '낙상·SOS 상태', description: '기존 낙상·SOS 화면 · 자동 감지 미연결', icon: 'sos', href: '/fall' },
  { title: '계정·권한', description: '내 프로필과 정보 접근 범위', icon: 'settings', href: '/account' },
  { title: '환경설정', description: '계정과 알림·접근성 설정', icon: 'settings', tab: 'settings' },
];
export function filterDashboardDestinations(query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return dashboardDestinations.filter(item => terms.every(term => `${item.title} ${item.description}`.toLocaleLowerCase().includes(term)));
}
export function DashboardDestinationCards({ items = dashboardDestinations, onOpen }: { items?: readonly Destination[]; onOpen: (item: Destination) => void }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{items.map(item => <Pressable key={item.title} accessibilityRole="button" onPress={() => onOpen(item)} style={({ pressed }) => ({ flexBasis: 220, flexGrow: 1, minWidth: 0, minHeight: 112, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: pressed ? C.mint : C.white, gap: 8 })}>
    <AppIcon name={item.icon} /><Text style={s.bodyStrong}>{item.title}</Text><Text style={s.caption}>{item.description}</Text>
  </Pressable>)}</View>;
}

export function DashboardNavigation({ onHistory }: { onHistory: () => void }) {
  const { user, roleLabel, setTab, setChatInput, sosDelay } = useDrMAS();
  const router = useRouter();
  const [panel, setPanel] = useState<'search' | 'menu' | 'sos' | 'medicine' | 'news' | null>(null);
  const [query, setQuery] = useState('');
  const items = filterDashboardDestinations(panel === 'search' ? query : '');
  function open(item: Destination) {
    setPanel(null); setQuery('');
    if (item.href) router.push(item.href);
    else if (item.tab) setTab(item.tab);
    else if (item.feature === 'history') onHistory();
    else if (item.feature) setPanel(item.feature);
  }
  return <>
    <View style={[s.appHeader, { minHeight: 72, paddingHorizontal: 16, gap: 8, backgroundColor: user?.role === 'guardian' ? C.green : C.white }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dr.MAS 홈" onPress={() => setTab('home')} style={[s.row, { minHeight: 48, flex: 1 }]}>
        <View style={{ width: 38, height: 38, borderRadius: 14, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}><AppIcon name="health" color={C.blue} /></View>
        <View><Text style={[s.headerBrand, { color: user?.role === 'guardian' ? C.white : C.blue }]}>Dr.MAS</Text><Text style={[s.caption, { color: user?.role === 'guardian' ? C.white : C.green }]}>{roleLabel} · 건강한 일상</Text></View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="통합 검색" onPress={() => { setQuery(''); setPanel('search'); }} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: C.pale }}><AppIcon name="search" /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="전체 메뉴" onPress={() => setPanel('menu')} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: C.pale }}><AppIcon name="menu" /></Pressable>
      <Action label="SOS" danger small onPress={() => setPanel('sos')} />
    </View>
    <FeatureModal visible={panel === 'search' || panel === 'menu'} title={panel === 'search' ? '무엇을 찾으세요?' : `${roleLabel} 전체 메뉴`} onClose={() => setPanel(null)}>
      {panel === 'search' && <><TextInput accessibilityLabel="기능과 건강정보 검색" placeholder="복약, 병원, 의약품, 상담…" value={query} onChangeText={setQuery} style={s.input} autoCorrect={false} /><Text style={s.caption}>기능을 찾거나 건강정보 질문을 상담 화면에서 검색하세요. 이 화면에서는 서버로 전송하지 않습니다.</Text>
        {!!query.trim() && <Action label="이 질문으로 건강정보 상담 열기" outline onPress={() => { setChatInput(query.trim()); setTab('ai'); setPanel(null); setQuery(''); }} />}
      </>}
      <DashboardDestinationCards items={items} onOpen={open} />
      {!items.length && <Text style={s.paragraph}>일치하는 기능이 없어요. 병원·의약품·상담처럼 짧게 입력해 주세요.</Text>}
    </FeatureModal>
    <FeatureModal visible={panel === 'sos'} title={user?.role === 'guardian' ? '보호자 SOS 수신함' : '긴급상황 SOS'} onClose={() => setPanel(null)}>
      {panel === 'sos' && user && <SosPanel actor={{ id: user.id, role: user.role }} delay={sosDelay} />}
    </FeatureModal>
    <FeatureModal visible={panel === 'medicine'} title="식약처 의약품 정보 검색" onClose={() => setPanel(null)}>{panel === 'medicine' && <PublicMedicineInfo />}</FeatureModal>
    <FeatureModal visible={panel === 'news'} title="공식 건강정보" onClose={() => setPanel(null)}>{panel === 'news' && <HealthNewsCarousel />}</FeatureModal>
  </>;
}
