import { useState } from 'react';
import { Text } from 'react-native';
import { FeatureTabs } from '../components/FeatureTabs';
import { FeaturePage } from '../components/FeaturePage';
import { FamilyPatientPicker } from '../components/FamilyPatientPicker';
import { HeartRatePanel } from '../components/HeartRatePanel';
import { WearableSimulatorPanel } from '../components/WearableSimulatorPanel';
import { Panel, StatusMessage, TitleRow, s } from '../components/ui';

export default function HealthScreen() {
  const [mode, setMode] = useState(0);
  return <FeaturePage title="건강·웨어러블" subtitle="내 기기의 측정 정보와 접근 권한을 확인하세요.">{user => <>
    {user.role === 'guardian' && <FamilyPatientPicker key={user.id} guardianId={user.id} />}
    <FeatureTabs labels={['가상 시뮬레이션', '실제 Health Connect']} selected={mode} onSelect={setMode} />
    {mode === 0 ? <WearableSimulatorPanel key={`simulator-${user.id}`} actor={{ id: user.id, role: user.role }} /> : user.role === 'patient' ? <HeartRatePanel key={user.id} /> : <StatusMessage>이 기기의 건강정보는 환자 가족의 기록이 아닙니다. 보호자 자동 공유는 지원하지 않으며 환자 본인 계정에서만 조회합니다.</StatusMessage>}
    {mode === 1 && <Panel>
      <TitleRow title="연결 안내 및 개인정보" accessory="심박수 읽기만" />
      <Text style={s.paragraph}>Galaxy Wearable 연결과 Samsung Health 동기화를 확인해 주세요. Android 14 이상은 시스템 Health Connect를, 이전 지원 기기는 Health Connect 앱 설치 상태를 확인하세요. Samsung Health와 워치 앱을 최신 버전으로 유지해 주세요.</Text>
      <Text style={s.paragraph}>기록이 없으면 Samsung Health → 설정 → 삼성 계정과 동기화 → 지금 동기화 후 다시 확인하세요. 화면의 측정 시각을 Samsung Health 기록과 비교하세요.</Text>
      <StatusMessage>Expo Go·웹·iOS에서는 지원하지 않습니다. Android Development Build를 설치해야 합니다. 걸음 수·수면은 추후 별도 동의를 받아 확장할 수 있으며 현재 권한을 요청하지 않습니다.</StatusMessage>
      <Text style={s.caption}>조회값은 화면 메모리에만 유지하며 로그아웃·계정 전환·화면 종료 시 폐기합니다. Health Connect는 휴대전화 사용자의 기록이므로 다른 사람의 기기에서 조회하지 마세요.</Text>
    </Panel>}
  </>}</FeaturePage>;
}
