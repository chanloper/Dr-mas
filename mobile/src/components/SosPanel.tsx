import React, { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { createSosRepository, sosErrorMessage, type SosActor, type SosAlert } from '../services/sos';
import { getSupabaseClient } from '../services/supabase';
import { Action, C, Panel, StatusMessage, s } from './ui';
import { EmergencyCallButton } from './EmergencyCallButton';

// Account-keyed component: unmount invalidates all pending UI updates.
export function SosPanel({ actor, delay = 10 }: { actor: SosActor; delay?: number }) {
  const [rows, setRows] = useState<SosAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [left, setLeft] = useState<number | null>(null);
  const live = useRef(false), reading = useRef(false), writing = useRef(false);
  const revision = useRef(0);
  const foreground = useRef(AppState.currentState === 'active');
  const repo = useRef<ReturnType<typeof createSosRepository> | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  function repository() { return repo.current ??= createSosRepository(getSupabaseClient()); }
  async function refresh() {
    if (!live.current || !foreground.current || reading.current || writing.current) return;
    reading.current = true;
    setLoading(true);
    const version = revision.current;
    try {
      const next = await repository().list(actor);
      if (live.current && foreground.current && version === revision.current) { setRows(next); setError(null); }
    } catch (e) {
      if (live.current && version === revision.current) { setRows([]); setError(sosErrorMessage(e)); }
    } finally { reading.current = false; if (live.current) setLoading(false); }
  }
  useEffect(() => { refreshRef.current = refresh; });
  useEffect(() => {
    live.current = true;
    void refreshRef.current();
    const timer = setInterval(() => { void refreshRef.current(); }, 15000);
    const listener = AppState.addEventListener('change', state => {
      foreground.current = state === 'active';
      if (state === 'active') void refreshRef.current();
      else { revision.current++; setLeft(null); setRows([]); }
    });
    return () => { live.current = false; clearInterval(timer); listener.remove(); };
  }, []);
  async function mutate(id?: string) {
    if (!live.current || writing.current || !foreground.current) return;
    writing.current = true; revision.current++; setBusy(true); setError(null); setNotice(null);
    let success = false;
    try {
      if (id) await repository().acknowledge(actor, id);
      else {
        const recipients = await repository().send(actor);
        if (live.current) setNotice(`보호자 ${recipients}명의 SOS 수신함에 요청이 저장됐습니다. 보호자가 확인했는지는 아래 내역에서 확인하세요.`);
      }
      if (id && live.current) setNotice('확인 상태를 저장했습니다.');
      success = true;
    } catch (e) { if (live.current) setError(sosErrorMessage(e)); }
    finally {
      writing.current = false;
      if (live.current) { setBusy(false); if (success) void refreshRef.current(); }
    }
  }
  const sendRef = useRef(mutate);
  useEffect(() => { sendRef.current = mutate; });
  useEffect(() => {
    if (left === null) return;
    const timer = setTimeout(() => {
      if (!live.current || !foreground.current) return;
      if (left <= 1) { setLeft(null); void sendRef.current(); }
      else setLeft(left - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [left]);
  return <View style={s.sectionGap}><Panel>
    <Text style={s.sectionTitle}>{actor.role === 'patient' ? '긴급 상황 SOS' : '가족 SOS 수신함'}</Text>
    <Text style={[s.paragraph, { marginVertical: 12 }]}>승인된 보호자에게 도움을 요청하고 확인 상태를 공유합니다. 이 화면에서 15초마다 갱신하며, 백그라운드 푸시는 지원하지 않습니다.</Text>
    {error && <StatusMessage kind="error">{error}</StatusMessage>}
    {notice && <StatusMessage>{notice}</StatusMessage>}
    {actor.role === 'patient' && (left === null
      ? <Action label={busy ? '처리 중…' : 'SOS 알림 시작'} danger disabled={busy} onPress={() => { setNotice(null); setLeft([10, 20, 30].includes(delay) ? delay : 10); }} />
      : <View style={[s.confirmation, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}><Text accessibilityLiveRegion="polite" style={[s.h1, { color: C.danger, textAlign: 'center' }]}>{left}초</Text><Text style={[s.paragraph, { textAlign: 'center' }]}>대기시간이 끝나면 승인된 보호자에게 SOS를 요청합니다.</Text><Action label="SOS 요청 취소" outline onPress={() => setLeft(null)} /></View>)}
    <View style={{ marginTop: 12 }}><Action label="SOS 내역 새로고침" outline disabled={busy || loading} onPress={() => { void refresh(); }} /></View>
    <Text style={[s.caption, { marginVertical: 8 }]}>미확인 요청 우선, 최대 최근 50건을 표시합니다. 연결이 해제되면 보호자는 해당 환자의 요청을 볼 수 없습니다.</Text>
    {loading && <StatusMessage kind="loading">SOS 내역을 확인하고 있습니다.</StatusMessage>}
    {!loading && !rows.length && !error && <StatusMessage kind="empty">표시할 SOS 요청이 없습니다.</StatusMessage>}
    {rows.map((row, index) => <View key={row.id} style={s.listItem}>
      <Text style={s.bodyStrong}>SOS 요청 {index + 1} · {row.acknowledged_at ? '보호자 확인 완료' : '보호자 미확인'}</Text>
      <Text style={s.caption}>{actor.role === 'guardian' ? '환자' : '보호자'} 계정 끝: {(actor.role === 'guardian' ? row.patient_id : row.guardian_id).slice(-4)}</Text>
      <Text style={s.caption}>요청: {new Date(row.created_at).toLocaleString()}</Text>
      {row.acknowledged_at && <Text style={s.caption}>확인: {new Date(row.acknowledged_at).toLocaleString()}</Text>}
      {actor.role === 'guardian' && !row.acknowledged_at && <Action label="요청 확인 완료" danger disabled={busy} onPress={() => { void mutate(row.id); }} />}
    </View>)}
    <View style={[s.confirmation, { borderColor: '#FECACA', backgroundColor: '#FFF7F7' }]}>
      <Text style={[s.bodyStrong, { color: '#991B1B' }]}>긴급 상황에는 119로 직접 전화하세요</Text>
      <Text style={s.paragraph}>SOS는 보호자에게 보내는 요청입니다. SOS 요청은 119 전화 연결이나 자동 신고를 실행하지 않습니다.</Text>
      <EmergencyCallButton />
    </View>
  </Panel></View>;
}
