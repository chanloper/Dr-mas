import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { requestEmergencyDialer } from '../services/emergencyCall';
import { Action, AppIcon, C, StatusMessage, s } from './ui';

export function EmergencyCallButton({ compact = false, outline = false, pressScale = false, testOnly = false }: { compact?: boolean; outline?: boolean; pressScale?: boolean; testOnly?: boolean }) {
  const [busy, setBusy] = useState(false), [result, setResult] = useState<'requested' | 'unavailable' | null>(null);
  const active = useRef(true), locked = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function openDialer() {
    if (testOnly) return;
    if (locked.current) return;
    locked.current = true; setBusy(true); setResult(null);
    try {
      const status = await requestEmergencyDialer(url => Linking.openURL(url));
      if (active.current) setResult(status);
    } finally { locked.current = false; if (active.current) setBusy(false); }
  }
  if (testOnly) return <View style={{ gap: 8 }}><Action label="119 긴급전화 · 테스트용 (발신 차단)" danger disabled onPress={() => {}} /><Text style={s.caption}>가상 낙상 테스트입니다. 전화 앱·문자·외부 푸시·응급기관 요청을 실행하지 않습니다.</Text></View>;
  return <View style={{ gap: 8, flexShrink: 0 }}>
    {compact
      ? <Pressable accessibilityRole="button" accessibilityLabel="119 직접 전화" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { void openDialer(); }} style={({ pressed }) => [
        { minHeight: 56, minWidth: 120, paddingHorizontal: 10, borderWidth: 1.5, borderColor: C.danger, borderRadius: 12, backgroundColor: C.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: busy ? .5 : pressed ? .78 : 1 },
        pressed && pressScale && { transform: [{ scale: .98 }] },
      ]}>
        <AppIcon name="call" color={C.danger} size={19} /><Text style={[s.actionText, { color: C.danger, fontSize: 15 }]}>119 전화</Text>
      </Pressable>
      : <Action label={busy ? '전화 앱 연결 요청 중…' : '119 직접 전화'} danger outline={outline} disabled={busy} pressScale={pressScale} onPress={() => { void openDialer(); }} />}
    {!compact && <Text style={s.caption}>버튼을 누르면 119 번호를 전화 앱으로 전달합니다. 실제 통화는 전화 앱에서 직접 진행하세요. 자동 신고나 위치 전송은 하지 않습니다.</Text>}
    {!compact && Platform.OS === 'web' && <Text style={s.caption}>브라우저 또는 기기가 전화 앱 연결을 지원하지 않으면 휴대전화에서 119를 직접 입력해 주세요.</Text>}
    {result === 'unavailable' && <StatusMessage kind="error">전화 앱을 열지 못했습니다. 휴대전화에서 119를 직접 입력해 전화해 주세요.</StatusMessage>}
    {result === 'requested' && <StatusMessage>전화 앱 열기를 요청했습니다. 앱이 열리지 않았다면 휴대전화에서 119를 직접 입력해 주세요. 이 화면에서는 통화 연결 여부를 확인할 수 없습니다.</StatusMessage>}
  </View>;
}
