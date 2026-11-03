import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { Action, C, Chip, Panel, TitleRow, s } from '../components/ui';
import { CareLinksPanel } from '../components/CareLinksPanel';

export default function SettingsScreen() {
  const { roleLabel, user, sosDelay, setSosDelay, signOut } = useDrMAS();
    return <><Text style={s.h1}>설정</Text><Text style={[s.paragraph, { marginTop: 8, marginBottom: 24 }]}>계정 및 앱 설정을 관리합니다.</Text>
      <Panel><TitleRow title="현재 화면" /><View style={[s.rowBetween, { marginTop: 12 }]}><Text style={s.bodyStrong}>{roleLabel} 모드</Text><Chip text="로그인됨" /></View>
        <Text style={[s.caption, { marginTop: 12, marginBottom: 14 }]}>{user?.email} · 계정 역할은 서버에서 관리합니다.</Text>
      </Panel>
      {user && <View style={s.sectionGap}><CareLinksPanel actor={{ id: user.id, role: user.role }} /></View>}
      <View style={s.sectionGap}><Panel><TitleRow title="SOS 알림 대기시간" accessory={`${sosDelay}초`} /><Text style={[s.caption, { marginVertical: 12 }]}>앱 내부 알림 흐름에만 적용됩니다. 실제 보호자 메시지는 발송되지 않습니다.</Text><View style={s.row}>{[10, 20, 30].map(n => <Pressable key={n} style={[s.delayChip, sosDelay === n && s.delaySelected]} onPress={() => setSosDelay(n)}><Text style={{ fontWeight: '700', color: sosDelay === n ? C.white : C.blue }}>{n}초</Text></Pressable>)}</View></Panel></View>
      <View style={s.sectionGap}><Panel><TitleRow title="안내" /><Text style={[s.paragraph, { marginTop: 12 }]}>Dr.MAS는 의료진의 진단이나 응급 구조 서비스를 대체하지 않습니다. 환자·보호자 연결은 위 연결 관리에서 확인하세요. 실제 정보 공유는 서버 권한과 환자 동의에 따릅니다.</Text></Panel></View>
      <View style={s.sectionGap}><Action label="로그아웃" outline onPress={signOut} /></View>
    </>;
  }
