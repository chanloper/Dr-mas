import React from 'react';
import { useRouter } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';
import { C, Chip, s } from '../components/ui';
import { useDrMAS } from '../features/app/context';

export default function ServicesScreen() {
    const router = useRouter();
    const { setTab } = useDrMAS();
    const services = [
    { icon: '▤', title: '처방전 스캔', desc: '카메라 · OCR · 약품명 확인', tag: '연동 예정' },
    { icon: '⌖', title: '주변 병원 · 약국', desc: '현재 위치 · 지역명 · 기관명 검색', tag: '검색하기', places: true },
    { icon: '♡', title: '건강 데이터', desc: 'Health Connect 연결', tag: '연동 예정' },
    { icon: '♧', title: '보호자 연결', desc: '연결 요청 · 승인 · 해제', tag: '연결 관리', care: true },
  ];
  return <><Text style={s.h1}>건강 서비스</Text><Text style={[s.paragraph, { marginTop: 8, marginBottom: 18 }]}>기존 Dr.MAS 기능을 모바일 앱에 연결하고 있어요.</Text>
      {services.map(item => <Pressable key={item.title} accessibilityRole="button" onPress={() => item.places ? router.push('/places') : item.care ? setTab('settings') : Alert.alert(item.title, '아직 사용할 수 없는 서비스입니다. 이용할 수 있게 되면 안내해 드리겠습니다.')} style={({ pressed }) => [s.serviceCard, { opacity: pressed ? .75 : 1 }]}>
        <View style={s.serviceIcon}><Text style={{ fontSize: 27, color: C.blue }}>{item.icon}</Text></View><View style={s.flex}><Text style={s.bodyStrong}>{item.title}</Text><Text style={[s.caption, { marginTop: 4 }]}>{item.desc}</Text><View style={{ marginTop: 9, alignSelf: 'flex-start' }}><Chip text={item.tag} kind="neutral" /></View></View><Text style={s.chevron}>›</Text>
      </Pressable>)}
      <View style={s.alertSoft}><Text style={s.alertSoftText}>의료 정보는 개인 민감정보이므로 서버 연동 전에는 실제 처방전·환자 데이터를 입력하지 마세요.</Text></View>
    </>;
  }
