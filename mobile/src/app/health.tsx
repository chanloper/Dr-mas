import { useState } from 'react';
import { Platform, Switch, Text, View } from 'react-native';
import { FeaturePage } from '../components/FeaturePage';
import { FeatureModal } from '../components/FeatureModal';
import { FeatureTabs } from '../components/FeatureTabs';
import { FamilyPatientPicker } from '../components/FamilyPatientPicker';
import { Action, Chip, Panel, StatusMessage, SummaryTile, TitleRow, s } from '../components/ui';

export default function HealthScreen() {
  const [tab, setTab] = useState(0), [connect, setConnect] = useState(false), [period, setPeriod] = useState(0);
  return <FeaturePage title="건강·웨어러블" subtitle="연결 상태, 측정 정보와 공유 범위를 한곳에서 확인하세요.">{user => <>
    {user.role === 'guardian' && <FamilyPatientPicker key={user.id} guardianId={user.id} />}
    <StatusMessage>웨어러블과 건강 정보 서비스는 미연결 상태입니다. 측정값이나 연결 성공 상태를 생성하지 않습니다.</StatusMessage>
    <FeatureTabs labels={['연결 관리', '건강 정보', '공유·권한']} selected={tab} onSelect={setTab} />
    {tab === 0 ? <Panel>
      <TitleRow title={user.role === 'patient' ? '내 기기 연결' : '가족 기기 연결 상태'} accessory="연결 없음" />
      <Text style={s.paragraph}>{Platform.OS === 'web' ? '웹에서는 Health Connect·HealthKit에 직접 연결할 수 없습니다. 모바일 앱 연동이 필요합니다.' : '모바일 건강 데이터 연결 기능이 아직 제공되지 않습니다.'}</Text>
      {['Android · Health Connect', 'iOS · HealthKit', '스마트워치 동기화'].map(label => <View key={label} style={s.listItem}><Text style={s.bodyStrong}>{label}</Text><Chip text="미연결" kind="neutral" /></View>)}
      <Text style={[s.caption, { marginVertical: 12 }]}>최근 동기화: 없음 · 연결된 기기: 없음</Text>
      <Action label="연결 방법·필요 권한 보기" outline onPress={() => setConnect(true)} />
      <View style={{ marginTop: 10 }}><Action label="동기화 · 미연결" disabled onPress={() => {}} /></View>
    </Panel> : tab === 1 ? <Panel>
      <TitleRow title="측정 정보" accessory="측정 기록 없음" />
      <FeatureTabs labels={['오늘', '최근 7일']} selected={period} onSelect={setPeriod} />
      <View style={s.tileGrid}><SummaryTile title="심박수" value="—" footer="측정 정보 없음" /><SummaryTile title="수면" value="—" footer="측정 정보 없음" /><SummaryTile title="걸음 수" value="—" footer="측정 정보 없음" /></View>
      <View style={[s.statusEmpty, { minHeight: 150, borderRadius: 14, padding: 20, marginTop: 16, justifyContent: 'center' }]}><Text style={[s.paragraph, { textAlign: 'center' }]}>측정 기록이 연결되면 추이를 표시합니다.{ '\n' }현재 표시할 그래프 데이터가 없습니다.</Text></View>
      <StatusMessage kind="empty">{period === 0 ? '오늘' : '최근 7일'} 동기화 이력이 없습니다. 건강 수치를 임의로 채우지 않습니다.</StatusMessage>
    </Panel> : <Panel>
      <TitleRow title="건강 정보 공유 범위" accessory="권한 미연결" />
      {['심박수 읽기', '수면 정보 읽기', '걸음 수 읽기'].map(label => <View key={label} style={[s.listItem, s.rowBetween]}><Text style={s.bodyStrong}>{label}</Text><Switch value={false} disabled accessibilityLabel={`${label} 미연결`} /></View>)}
      <StatusMessage>위 설정은 실제 기기 권한이 아닙니다. 환자의 동의와 플랫폼 권한 연동 후 사용할 수 있습니다. 보호자 연결 승인만으로 건강 정보 권한이 추가되지 않습니다.</StatusMessage>
      <Action label="공유 설정 저장 · 미연결" disabled onPress={() => {}} />
    </Panel>}
    <FeatureModal visible={connect} title="기기 연결 안내" onClose={() => setConnect(false)}>
      <Text style={s.paragraph}>Android는 Health Connect, iOS는 HealthKit 연결과 항목별 사용자 동의가 필요합니다. 웹에서 이 권한을 대신 승인할 수 없습니다. 현재 화면에서는 권한 요청·기기 검색·연결을 실행하지 않습니다.</Text>
    </FeatureModal>
  </>}</FeaturePage>;
}
