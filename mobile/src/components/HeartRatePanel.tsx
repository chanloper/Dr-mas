import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { Action, Panel, StatusMessage, SummaryTile, TitleRow, s } from './ui';
import { openHeartPermissions, readSamsungHeartRate, type HeartResult } from '../features/wearable/healthConnect';

const messages = {
  unsupported: '웹과 iOS에서는 지원하지 않습니다. Android Development Build에서 이용해 주세요.',
  'build-required': 'Expo Go에는 Health Connect가 없습니다. 새 Android Development Build를 설치해 주세요.',
  unavailable: '이 기기에서 Health Connect를 사용할 수 없습니다. Android 버전과 Health Connect 설치 상태를 확인해 주세요.',
  'update-required': 'Health Connect 설치 또는 업데이트가 필요합니다. 휴대전화 설정에서 Health Connect를 확인해 주세요.',
  denied: '심박수 읽기 권한이 없습니다. 권한을 거부해도 다른 Dr.MAS 기능은 이용할 수 있습니다.',
  error: '심박수를 읽지 못했습니다. 새 네이티브 빌드 설치와 Health Connect 권한을 확인한 뒤 다시 시도해 주세요.',
};

export function HeartRatePanel() {
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false);
  const [result, setResult] = useState<HeartResult | null>(null);
  const revision = useRef(0), lock = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') setResult(null);
    });
    return () => {
      // This counter invalidates asynchronous reads, not a rendered node reference.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      revision.current++; sub.remove();
    };
  }, []);
  async function read(request: boolean) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setResult(null);
    // Permission dialogs can change AppState; begin a fresh generation on completion.
    const epoch = revision.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const value = await Promise.race([
      readSamsungHeartRate(request),
      new Promise<HeartResult>(resolve => { timer = setTimeout(() => resolve({ status: 'error' }), 60000); }),
    ]);
    clearTimeout(timer);
    if (epoch === revision.current) {
      if (AppState.currentState === 'active') setResult(value);
      lock.current = false; setBusy(false);
    }
  }
  const reading = result?.status === 'ready' ? result.reading : null;
  return <Panel>
    <TitleRow title="내 휴대전화의 심박수" accessory="Health Connect" />
    <Text style={s.paragraph}>Samsung Health가 공유한 최근 7일의 실제 기록을 읽습니다. 이 화면에서만 확인하며 서버 저장·보호자 공유·외부 AI 전송은 하지 않습니다.</Text>
    <Text style={s.caption}>휴대전화 건강정보의 주인이 본인인지 확인해 주세요. Dr.MAS 계정과 Samsung 계정은 자동으로 일치 여부를 확인할 수 없습니다.</Text>
    {!consent ? <Action label="동의하고 심박수 읽기 권한 요청" onPress={() => { setConsent(true); void read(true); }} /> : <>
      <Action label={busy ? '심박수 확인 중…' : '심박수 새로고침'} disabled={busy} onPress={() => void read(false)} />
      {result?.status === 'denied' && <Action label="읽기 권한 다시 요청" outline onPress={() => void read(true)} />}
    </>}
    {result && result.status !== 'ready' && <StatusMessage>{messages[result.status]}</StatusMessage>}
    {result?.status === 'ready' && !reading && <StatusMessage>최근 7일 Samsung Health 심박수 기록이 없습니다. 워치 측정 후 Samsung Health와 Health Connect 동기화를 확인해 주세요.</StatusMessage>}
    {reading && <View style={{ marginVertical: 16 }}>
      <SummaryTile title="최근 심박수" value={`${reading.bpm} BPM`} footer={new Date(reading.time).toLocaleString()} />
      <Text style={s.paragraph}>출처: Samsung Health ({reading.origin})</Text>
      <Text style={s.caption}>기록 기기: {reading.device ?? '확인되지 않음'} · 출처 앱만으로 갤럭시 워치 측정값이라고 단정할 수 없습니다.</Text>
    </View>}
    <Text style={s.paragraph}>연결 순서: 워치에서 측정 → 휴대전화 Samsung Health 동기화 → Samsung Health 설정의 Health Connect에서 심박수 쓰기 허용 → Dr.MAS 심박수 읽기 허용.</Text>
    <Text style={s.caption}>동기화는 지연될 수 있습니다. 실시간 응급 감지·자동 SOS 기능이 아닙니다. 걸음 수·수면은 아직 읽지 않습니다.</Text>
    <Action label="Health Connect 권한 설정·연동 해제" outline disabled={busy} onPress={() => {
      revision.current++; setResult(null); setConsent(false);
      void openHeartPermissions().then(ok => { if (!ok) setResult({ status: 'unsupported' }); });
    }} />
    <Text style={s.caption}>설정 → 앱 권한 → Dr.MAS(앱 이름 mobile) → 심박수 읽기 해제. 해제는 다른 앱의 원본 기록을 삭제하지 않습니다. 긴급 상황은 홈의 기존 수동 SOS를 이용하세요.</Text>
  </Panel>;
}
