import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { C, s } from '../components/ui';
import { useDrMAS } from '../features/app/context';
import { DashboardDestinationCards } from '../components/DashboardNavigation';
import { FeatureModal } from '../components/FeatureModal';
import { PublicMedicineInfo } from '../components/PublicMedicineInfo';
import { HealthNewsCarousel } from '../components/HealthNewsCarousel';

export default function ServicesScreen({ onHistory }: { onHistory?: () => void }) {
  const router = useRouter();
  const { setTab, roleLabel } = useDrMAS();
  const [feature, setFeature] = useState<'medicine' | 'news' | null>(null);
  return <>
    <View style={[s.panel, { backgroundColor: C.mint, marginBottom: 24, gap: 8 }]}><Text style={s.overline}>{roleLabel}의 건강 도구</Text><Text style={s.h1}>필요한 서비스를 한곳에</Text><Text style={s.paragraph}>가족 연결부터 건강정보 검색까지, 지금 필요한 기능을 선택하세요.</Text></View>
    <DashboardDestinationCards onOpen={item => {
      if (item.href) router.push(item.href);
      else if (item.tab) setTab(item.tab);
      else if (item.feature === 'history') { if (onHistory) onHistory(); else setTab('ai'); }
      else if (item.feature) setFeature(item.feature);
    }} />
    <FeatureModal visible={feature !== null} title={feature === 'medicine' ? '식약처 의약품 정보 검색' : '공식 건강정보'} onClose={() => setFeature(null)}>
      {feature === 'medicine' ? <PublicMedicineInfo /> : feature === 'news' ? <HealthNewsCarousel /> : null}
    </FeatureModal>
  </>;
}
