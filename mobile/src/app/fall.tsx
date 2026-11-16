import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FeaturePage } from '../components/FeaturePage';
import { FeatureModal } from '../components/FeatureModal';
import { FamilyPatientPicker } from '../components/FamilyPatientPicker';
import { EmergencyCallButton } from '../components/EmergencyCallButton';
import { Action, C, Chip, Panel, StatusMessage, TitleRow, s } from '../components/ui';

export default function FallScreen() {
  const router = useRouter();
  const [delay, setDelay] = useState(10), [preview, setPreview] = useState(false), [cancelled, setCancelled] = useState(false), [resultOpen, setResultOpen] = useState(false);
  return <FeaturePage title="낙상 감지·SOS 설정" subtitle="낙상 감지 준비 상태와 도움 요청 흐름을 확인하세요.">{user => <>
    {user.role === 'guardian' && <FamilyPatientPicker key={user.id} guardianId={user.id} />}
    <StatusMessage>센서 감지·음성 취소·FCM 전송·원격 설정은 미연결입니다. 아래 입력과 미리보기는 실제 낙상 감지나 SOS 전송을 실행하지 않습니다.</StatusMessage>
    <Panel style={{ marginTop: 16 }}>
      <TitleRow title="낙상 감지 상태" accessory="감지 장치 없음" />
      <View style={s.rowBetween}><Text style={s.bodyStrong}>자동 감지</Text><Switch value={false} disabled accessibilityLabel="자동 낙상 감지 미연결" /></View>
      <View style={{ marginTop: 10 }}><Chip text="자동 감지 꺼짐 · 미연결" kind="neutral" /></View>
      <Text style={[s.caption, { marginTop: 12 }]}>센서 연결: 없음 · 최근 감지: 없음</Text>
    </Panel>
    <Panel style={s.sectionGap}>
      <TitleRow title={user.role === 'patient' ? '낙상 알림 대기시간' : '환자 대기시간 원격 설정'} accessory="임시 선택" />
      <Text style={s.paragraph}>10~30초 범위에서 1초 단위로 선택합니다. 여기서 선택한 값은 저장되거나 기존 수동 SOS 설정에 적용되지 않습니다.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 14 }}>
        {Array.from({ length: 21 }, (_, i) => i + 10).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${value}초`} accessibilityState={{ checked: delay === value }} onPress={() => setDelay(value)}
          style={[s.action, { minWidth: 52, padding: 8, backgroundColor: delay === value ? C.blue : C.white, borderColor: delay === value ? C.blue : C.line }]}><Text style={[s.bodyStrong, { color: delay === value ? C.white : C.ink }]}>{value}초</Text></Pressable>)}
      </View>
      <Action label="대기시간 저장 · 미연결" disabled onPress={() => {}} />
      {user.role === 'guardian' && <Text style={[s.caption, { marginTop: 10 }]}>승인된 연결만으로 환자 설정 변경 권한이 부여되지 않습니다. 현재 원격 변경은 제공하지 않습니다.</Text>}
    </Panel>
    <Panel style={s.sectionGap}>
      <TitleRow title="감지 후 취소·알림 흐름" />
      <Text style={s.paragraph}>1. 감지 이벤트 확인 → 2. 대기·취소 → 3. 보호자 전송 결과 확인</Text>
      <View style={{ marginTop: 14 }}><Action label="대기·취소 화면 미리보기" outline onPress={() => { setCancelled(false); setPreview(true); }} /></View>
      {cancelled && <StatusMessage>미리보기를 취소했습니다. 실제 SOS 요청이나 보호자 알림은 발생하지 않았습니다.</StatusMessage>}
      <StatusMessage kind="empty">낙상 이벤트·자동 알림 이력이 없습니다. 실제 수동 SOS 내역은 홈에서 확인하세요.</StatusMessage>
      <View style={{ marginBottom: 10 }}><Action label="낙상 알림 결과 항목 보기" outline onPress={() => setResultOpen(true)} /></View>
      <Action label="홈의 실제 SOS 열기" onPress={() => router.replace({ pathname: '/', params: { section: 'home' } })} />
    </Panel>
    <Panel style={s.sectionGap}><TitleRow title="119 직접 전화" /><EmergencyCallButton /></Panel>
    <FeatureModal visible={preview} title="낙상 알림 대기 화면 미리보기" onClose={() => setPreview(false)}>
      <Chip text="실제 감지·전송 없음" kind="neutral" />
      <View style={{backgroundColor:C.dangerSoft,borderColor:C.danger,borderWidth:2,borderRadius:24,padding:24,marginVertical:16,gap:12}}><Text style={[s.bodyStrong,{color:C.danger,textAlign:'center'}]}>SOS 대기 화면 미리보기</Text><Text style={[s.h1, { textAlign: 'center', color: C.danger, fontSize: 40, lineHeight: 52 }]}>{delay}초</Text></View>
      <Text style={s.paragraph}>선택한 대기시간의 화면 구성입니다. 시간이 흐르거나 자동 SOS가 발송되지 않습니다.</Text>
      <Action label="대기 취소" outline onPress={() => { setPreview(false); setCancelled(true); }} />
      <Action label="음성으로 취소 · 미연결" outline disabled onPress={() => {}} />
      <Action label="화면 3회 터치 취소 · 미연결" outline disabled onPress={() => {}} />
      <Text style={s.caption}>음성 취소 · 화면 반복 터치 취소: 미연결. 실제 긴급 상황에는 미리보기 대신 홈의 SOS 또는 119 직접 전화를 사용하세요.</Text>
    </FeatureModal>
    <FeatureModal visible={resultOpen} title="낙상 알림 결과" onClose={() => setResultOpen(false)}>
      <StatusMessage kind="empty">선택된 낙상 이벤트가 없습니다. 감지·전송 성공을 의미하지 않습니다.</StatusMessage>
      {['감지 시각', '환자 확인·취소', '위치 정보', '보호자 전송 결과', '보호자 확인 시각'].map(label => <View key={label} style={s.listItem}><Text style={s.bodyStrong}>{label}</Text><Text style={s.caption}>정보 없음</Text></View>)}
      <Text style={s.caption}>실제 수동 SOS의 요청·확인 기록은 홈의 수신함에 그대로 유지됩니다.</Text>
    </FeatureModal>
  </>}</FeaturePage>;
}
