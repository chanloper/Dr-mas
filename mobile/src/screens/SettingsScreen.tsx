import React from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { Action, AppIcon, C, Chip, Panel, TitleRow, s } from '../components/ui';
import { SosDelaySlider } from '../components/SosDelaySlider';
import { CareLinksPanel } from '../components/CareLinksPanel';
import { rlsDiagnosticsEnabled } from '../dev/rlsDiagnostics';
import { DevNotificationsPanel } from '../dev/DevNotificationsPanel';

export default function SettingsScreen() {
  const router = useRouter();
  const { roleLabel, user, sosDelay, setSosDelay, signOut, authLoading } = useDrMAS();
    return <><Text style={s.overline}>내 계정과 가족의 안심</Text><Text style={s.h1}>나의 설정</Text><Text style={[s.paragraph, { marginTop: 6, marginBottom: 24 }]}>계정, 가족 연결, 알림을 한곳에서 관리해요.</Text>
      <Panel><View style={[s.row,{marginBottom:16}]}><View style={[s.serviceIcon,{backgroundColor:user?.role==='guardian'?C.mint:C.pale}]}><AppIcon name="settings" /></View><View style={s.flex}><Text style={s.sectionTitle}>{user?.name||'내 계정'}</Text><Text style={s.caption}>{roleLabel} 계정</Text></View><Chip text="로그인됨" kind={user?.role==='guardian'?'green':'blue'} /></View>
        <Text style={[s.caption, { marginTop: 12, marginBottom: 14 }]}>{user?.email}</Text>
        <Text style={s.caption}>계정 유형과 연결 승인 상태에 따라 이용할 수 있는 기능이 달라집니다.</Text>
      </Panel>
      <View style={[s.sectionGap, { gap: 10 }]}><TitleRow title="계정과 건강 관리" /><Action label="계정·권한 상세" outline onPress={() => router.push('/account')} /><Action label="건강 정보 공유·기기 연결" outline onPress={() => router.push('/health')} /><Action label="낙상 감지·알림 설정" outline onPress={() => router.push('/fall')} /></View>
      {user && <View style={s.sectionGap}><CareLinksPanel actor={{ id: user.id, role: user.role }} /></View>}
      {rlsDiagnosticsEnabled() && <View style={s.sectionGap}><Action label="RLS 보안 검사" outline onPress={() => {
        if (rlsDiagnosticsEnabled()) router.push('/_dev/rls-check');
      }} /></View>}
      <DevNotificationsPanel />
      {user?.role === 'patient' && <View style={s.sectionGap}><Panel><TitleRow title="SOS 알림 대기시간" accessory={`${sosDelay}초`} /><Text style={[s.caption, { marginVertical: 12 }]}>승인된 보호자에게 SOS를 요청하기 전 취소할 수 있는 시간입니다. 119 전화 연결이나 자동 신고와는 별개입니다.</Text><SosDelaySlider value={sosDelay} onChange={setSosDelay} /></Panel></View>}
      <View style={s.sectionGap}><Panel><TitleRow title="안내" /><Text style={[s.paragraph, { marginTop: 12 }]}>Dr.MAS는 의료진의 진단이나 응급 구조 서비스를 대체하지 않습니다. 환자·보호자 연결은 위 연결 관리에서 확인하세요. 실제 정보 공유는 서버 권한과 환자 동의에 따릅니다.</Text></Panel></View>
      <View style={s.sectionGap}><Action label={authLoading ? '로그아웃 처리 중…' : '로그아웃'} outline disabled={authLoading} onPress={signOut} /></View>
    </>;
  }
