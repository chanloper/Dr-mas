import { useEffect, useRef, useState } from 'react';
import { AppState, Button, ScrollView, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { getSupabaseClient, matchesSupabaseProject } from '../services/supabase';
import { createRlsDiagnostics, rlsDiagnosticsEnabled, type DiagnosticRow, type TestAccount } from './rlsDiagnostics';

let diagnostics: ReturnType<typeof createRlsDiagnostics> | undefined;
export function RlsDiagnosticsScreen() {
  const router = useRouter();
  const [account, setAccount] = useState<TestAccount>('A');
  const [patient, setPatient] = useState(''), [guardian, setGuardian] = useState('');
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<DiagnosticRow[]>([]);
  const live = useRef(false), generation = useRef(0), locked = useRef(false);
  useEffect(() => {
    live.current = true;
    function clear() { generation.current++; setPatient(''); setGuardian(''); setRows([]); setConfirmed(false); }
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') clear(); });
    let stop = () => {};
    if (rlsDiagnosticsEnabled()) {
      try { const watch = getSupabaseClient().auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') clear(); }); stop = () => watch.data.subscription.unsubscribe(); }
      catch { /* Connection failure is shown as a fixed code on explicit run. */ }
    }
    return () => { live.current = false; listener.remove(); stop(); };
  }, []);
  async function run() {
    if (!rlsDiagnosticsEnabled() || !confirmed || locked.current) return;
    locked.current = true; setBusy(true); setRows([]);
    const version = ++generation.current;
    try {
      diagnostics ??= createRlsDiagnostics(getSupabaseClient(), rlsDiagnosticsEnabled, matchesSupabaseProject);
      const result = await diagnostics.run(account, patient, guardian);
      if (live.current && generation.current === version) setRows(result);
    } catch {
      if (live.current && generation.current === version) setRows([{ check: '실행 조건', count: null, error: true, result: 'FAIL', reason: 'CONFIG_OR_NETWORK' }]);
    } finally {
      locked.current = false;
      if (live.current) { setBusy(false); setPatient(''); setGuardian(''); }
    }
  }
  return <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
    <Text>DEV 전용 RLS 진단 · 일반 사용자 세션 · SELECT만 실행</Text>
    <Text>현재 로그인한 합성 계정을 선택하세요. 같은 앱 실행에서 A → G → B/H 순서로 검사하세요. SOS 0행 판정에는 A와 G의 실제 양성 조회가 모두 필요합니다. 결과는 저장·로그 전송하지 않습니다.</Text>
    {(['A', 'B', 'G', 'H'] as TestAccount[]).map(label => <Button key={label} title={account === label ? `${label} 선택됨` : label} disabled={busy} onPress={() => { setAccount(label); setRows([]); }} />)}
    <TextInput accessibilityLabel="합성 환자 A 식별자" placeholder="합성 환자 A 식별자" secureTextEntry value={patient} onChangeText={setPatient} editable={!busy} autoCapitalize="none" autoCorrect={false} autoComplete="off" maxLength={36} />
    <TextInput accessibilityLabel="승인된 보호자 G 식별자" placeholder="승인된 보호자 G 식별자" secureTextEntry value={guardian} onChangeText={setGuardian} editable={!busy} autoCapitalize="none" autoCorrect={false} autoComplete="off" maxLength={36} />
    <Button title={confirmed ? 'Dev 프로젝트·합성 계정 확인됨' : 'DrMAS-Dev와 합성 계정만 사용함을 확인'} disabled={busy} onPress={() => setConfirmed(!confirmed)} />
    <Button title={busy ? '검사 중' : '읽기 전용 검사 실행'} disabled={busy || !confirmed || !patient || !guardian} onPress={() => { void run(); }} />
    {rows.map(r => <Text key={r.check}>{r.check}: {r.result} · 오류 {r.error ? '있음' : '없음'} · 행 수 {r.count ?? '미확인'}</Text>)}
    <Button title="진단 결과·기준 지우기" disabled={busy} onPress={() => { diagnostics?.clearBaseline(); setRows([]); setPatient(''); setGuardian(''); setConfirmed(false); }} />
    <Button title="앱으로 돌아가기" onPress={() => router.push('/')} />
  </ScrollView>;
}
