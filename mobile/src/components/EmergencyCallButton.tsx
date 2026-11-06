import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { requestEmergencyDialer } from '../services/emergencyCall';
import { Action, StatusMessage, s } from './ui';

export function EmergencyCallButton() {
  const [busy, setBusy] = useState(false), [result, setResult] = useState<'requested' | 'unavailable' | null>(null);
  const active = useRef(true), locked = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function openDialer() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setResult(null);
    try {
      const status = await requestEmergencyDialer(url => Linking.openURL(url));
      if (active.current) setResult(status);
    } finally { locked.current = false; if (active.current) setBusy(false); }
  }
  return <View style={{ gap: 8 }}>
    <Action label={busy ? '전화 앱 연결 요청 중…' : '119 전화 앱 열기'} danger outline disabled={busy} onPress={() => { void openDialer(); }} />
    <Text style={s.caption}>버튼을 누르면 119 번호를 전화 앱으로 전달합니다. 실제 통화는 전화 앱에서 직접 진행하세요. 자동 신고나 위치 전송은 하지 않습니다.</Text>
    {Platform.OS === 'web' && <Text style={s.caption}>브라우저 또는 기기가 전화 앱 연결을 지원하지 않으면 휴대전화에서 119를 직접 입력해 주세요.</Text>}
    {result === 'unavailable' && <StatusMessage kind="error">전화 앱을 열지 못했습니다. 휴대전화에서 119를 직접 입력해 전화해 주세요.</StatusMessage>}
    {result === 'requested' && <StatusMessage>전화 앱 열기를 요청했습니다. 앱이 열리지 않았다면 휴대전화에서 119를 직접 입력해 주세요. 이 화면에서는 통화 연결 여부를 확인할 수 없습니다.</StatusMessage>}
  </View>;
}
