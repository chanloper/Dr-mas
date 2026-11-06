import React from 'react';
import { useRouter, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { C, Chip, s } from '../components/ui';
import { useDrMAS } from '../features/app/context';

export default function ServicesScreen() {
    const router = useRouter();
    const { setTab, user } = useDrMAS();
    const services: { icon: string; title: string; desc: string; tag: string; href?: Href; care?: boolean; patientOnly?: boolean }[] = [
    { icon: '▤', title: '처방전 분석', desc: '촬영 준비 · 약품명 확인 · DUR 결과', tag: '화면 보기 · 분석 미연결', href: '/prescription', patientOnly: true },
    { icon: '⌖', title: '주변 병원 · 약국', desc: '현재 위치 · 키워드 · 기관 상세', tag: '검색 화면', href: '/places' },
    { icon: '♡', title: '건강·웨어러블', desc: '기기 연결 · 측정 정보 · 공유 권한', tag: '화면 보기 · 기기 미연결', href: '/health' },
    { icon: '♧', title: '보호자 연결', desc: '연결 요청 · 승인 · 해제 · 이력', tag: '연결 관리', care: true },
    { icon: '⚠', title: '낙상 감지·SOS', desc: '감지 상태 · 대기·취소 · 알림 안내', tag: '화면 보기 · 자동 감지 미연결', href: '/fall' },
    { icon: '⚙', title: '계정·권한', desc: '프로필 · 보안 안내 · 정보 접근 범위', tag: '계정 관리', href: '/account' },
  ];
  return <><Text style={s.h1}>건강 서비스</Text><Text style={[s.paragraph, { marginTop: 8, marginBottom: 18 }]}>필요한 건강 관리 서비스를 한곳에서 확인하세요.</Text>
      {services.map(item => { const disabled = Boolean(item.patientOnly && user?.role !== 'patient'); return <Pressable key={item.title} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => item.href ? router.push(item.href) : setTab('settings')} style={({ pressed }) => [s.serviceCard, { opacity: disabled ? .6 : pressed ? .75 : 1 }]}>
        <View style={s.serviceIcon}><Text style={{ fontSize: 27, color: C.blue }}>{item.icon}</Text></View><View style={s.flex}><Text style={s.bodyStrong}>{item.title}</Text><Text style={[s.caption, { marginTop: 4 }]}>{item.desc}</Text><View style={{ marginTop: 9, alignSelf: 'flex-start' }}><Chip text={disabled ? '환자 본인 전용' : item.tag} kind="neutral" /></View></View>{!disabled && <Text style={s.chevron}>›</Text>}
      </Pressable>; })}
      <View style={s.alertSoft}><Text style={s.alertSoftText}>연동 예정인 서비스는 아직 이용할 수 없습니다. 처방전이나 다른 사람의 개인정보를 입력하지 마세요.</Text></View>
    </>;
  }
