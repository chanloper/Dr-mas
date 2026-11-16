import { normalizeSosDelay } from '../services/sosDelay';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, LayoutAnimation, Platform, Pressable, Text, View } from 'react-native';
import { createSosRepository, sosErrorMessage, type SosActor, type SosAlert } from '../services/sos';
import { getSupabaseClient } from '../services/supabase';
import { Action, AppIcon, C, Chip, Panel, StatusMessage, s } from './ui';
import { EmergencyCallButton } from './EmergencyCallButton';
import { watchSos } from '../services/sosRealtime';
import { readApprovedCareNames, type CareName } from '../services/careNames';

// Account-keyed component: unmount invalidates all pending UI updates.
export function SosPanel({ actor, delay = 10, compact = false, historyOnly = false }: { actor: SosActor; delay?: number; compact?: boolean; historyOnly?: boolean }) {
  const [rows, setRows] = useState<SosAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [left, setLeft] = useState<number | null>(null);
  const [details, setDetails] = useState(false);
  const [names, setNames] = useState<CareName[]>([]);
  const [reduceMotion, setReduceMotion] = useState(true);
  const dirty = useRef(false);
  const nameRevision = useRef(0);
  const live = useRef(false), reading = useRef(false), writing = useRef(false);
  const revision = useRef(0);
  const foreground = useRef(AppState.currentState === 'active');
  const repo = useRef<ReturnType<typeof createSosRepository> | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const compactPatientActions = actor.role === 'patient' && compact && left === null;
  useEffect(() => {
    if (!compact || actor.role !== 'patient') return;
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { if (mounted) setReduceMotion(value); });
    return () => { mounted = false; subscription.remove(); };
  }, [actor.role, compact]);
  function repository() { return repo.current ??= createSosRepository(getSupabaseClient()); }
  function toggleDetails() {
    if (!reduceMotion && Platform.OS !== 'web') LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDetails(value => !value);
  }
  async function refresh() {
    if (!live.current || !foreground.current) return;
    if (reading.current || writing.current) { dirty.current = true; return; }
    dirty.current = false;
    reading.current = true;
    const nameVersion = ++nameRevision.current;
    setLoading(true);
    const version = revision.current;
    try {
      const next = await repository().list(actor);
      if (live.current && foreground.current && version === revision.current) {
        setRows(next); setNames([]); setError(null);
        if (actor.role === 'guardian' && next.some(row => !row.acknowledged_at)) setDetails(true);
        const nextNames = await readApprovedCareNames(getSupabaseClient(), actor);
        if (live.current && foreground.current && version === revision.current && nameVersion === nameRevision.current) setNames(nextNames);
      }
    } catch (e) {
      if (live.current && version === revision.current) { setRows([]); setError(sosErrorMessage(e)); }
    } finally {
      reading.current = false;
      if (live.current) {
        setLoading(false);
        if (dirty.current && foreground.current) void refreshRef.current();
      }
    }
  }
  useEffect(() => { refreshRef.current = refresh; });
  useEffect(() => {
    live.current = true;
    const invalidate = () => { live.current = false; revision.current++; };
    let stop: (() => void) | undefined;
    const subscribe = () => {
      stop?.();
      stop = watchSos(getSupabaseClient(), { id: actor.id, role: actor.role }, () => { void refreshRef.current(); }, () => {});
    };
    if (foreground.current) subscribe();
    void refreshRef.current();
    const timer = setInterval(() => { void refreshRef.current(); }, 3000);
    const listener = AppState.addEventListener('change', state => {
      foreground.current = state === 'active';
      if (state === 'active') { subscribe(); void refreshRef.current(); }
      else { stop?.(); stop = undefined; revision.current++; setLeft(null); setRows([]); setNames([]); }
    });
    return () => { invalidate(); stop?.(); clearInterval(timer); listener.remove(); };
  }, [actor.id, actor.role]);
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
      if (live.current) { setBusy(false); if (success || dirty.current) void refreshRef.current(); }
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
  return <View style={[s.sectionGap, compactPatientActions && { marginTop: 16 }]}><Panel style={{borderColor:actor.role==='patient'?C.danger:C.line,backgroundColor:compactPatientActions?'#FFF0EE':actor.role==='patient'?'#FFF4F3':C.white,...(compactPatientActions?{padding:16,borderWidth:0}:{})}}>
    {compactPatientActions
      ? <View style={s.row}>
        <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><AppIcon name="sos" color={C.white} size={26} /></View>
        <View style={{ flex: 1, minWidth: 0 }}><View style={s.rowBetween}><Text style={[s.sectionTitle,{color:C.danger}]}>응급 안전 알림</Text><Chip text="수동 요청" kind="red" /></View></View>
      </View>
      : <View style={{borderLeftWidth:4,borderLeftColor:C.danger,paddingLeft:12}}><Text style={[s.sectionTitle,{color:actor.role==='patient'?C.danger:C.ink}]}>{actor.role === 'patient' ? '긴급 상황 SOS' : '가족 SOS 수신함'}</Text></View>}
    <Text style={[s.caption, { marginVertical: compactPatientActions ? 6 : 10 }]}>{compact ? actor.role === 'patient' ? `보호자에게 도움을 요청해요 · ${normalizeSosDelay(delay)}초 안에 취소 가능` : '가족이 보낸 도움 요청과 확인 상태를 살펴보세요.' : '승인된 보호자에게 도움을 요청하고 확인 상태를 공유합니다.'}</Text>
    {error && <StatusMessage kind="error">{error}</StatusMessage>}
    {notice && <StatusMessage>{notice}</StatusMessage>}
    <Text style={s.caption}>이 화면을 보고 있는 동안 3초 간격으로 SOS 내역을 확인합니다. 조회 중에는 중복 요청하지 않으며, 백그라운드 푸시는 지원하지 않습니다.</Text>
    {actor.role === 'patient' && !historyOnly && (compactPatientActions
      ? <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}><Action label={busy ? '처리 중…' : 'SOS 알림 시작'} danger disabled={busy} pressScale onPress={() => { setNotice(null); setLeft(normalizeSosDelay(delay)); }} /></View>
        <EmergencyCallButton compact outline pressScale />
      </View>
      : <>
        <EmergencyCallButton />
        {left === null
          ? <Action label={busy ? '처리 중…' : 'SOS 알림 시작'} danger disabled={busy} onPress={() => { setNotice(null); setLeft(normalizeSosDelay(delay)); }} />
          : <View style={[s.confirmation, { borderColor: C.danger, borderWidth:2,backgroundColor: '#FFF4F3',gap:18 }]}><View style={{alignSelf:'center',minWidth:120,minHeight:120,borderRadius:64,borderWidth:6,borderColor:C.danger,alignItems:'center',justifyContent:'center',padding:16}}><Text accessibilityLiveRegion="polite" style={[s.h1, { color: C.danger, textAlign: 'center',fontSize:36,lineHeight:48 }]}>{left}초</Text></View><Text style={[s.paragraph, { textAlign: 'center' }]}>대기시간이 끝나면 승인된 보호자에게 SOS를 요청합니다.</Text><Action label="SOS 요청 취소" outline onPress={() => setLeft(null)} /></View>}
      </>)}
    {compact && <Pressable accessibilityRole="button" accessibilityLabel={details ? 'SOS 기록과 안전 안내 접기' : 'SOS 기록과 안전 안내 보기'} accessibilityState={{ expanded: details }} onPress={toggleDetails} style={({ pressed }) => [
      { minHeight: 44, marginTop: 6, paddingHorizontal: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FFF8F7' },
      pressed && { transform: [{ scale: .985 }] },
    ]}><Text style={[s.caption, { color: C.danger, fontWeight: '700' }]}>{details ? 'SOS 기록과 안전 안내 접기' : `SOS 기록과 안전 안내 보기${rows.some(row => !row.acknowledged_at) ? ' · 미확인 요청 있음' : ''}`}</Text><AppIcon name={details ? 'chevronUp' : 'chevronDown'} color={C.danger} size={18} /></Pressable>}
    {(!compact || details) && <>
    <View style={{ marginTop: 12 }}><Action label="SOS 내역 새로고침" outline disabled={busy || loading} onPress={() => { void refresh(); }} /></View>
    <Text style={[s.caption, { marginVertical: 8 }]}>미확인 요청 우선, 최대 최근 50건을 표시합니다. 연결이 해제되면 보호자는 해당 환자의 요청을 볼 수 없습니다.</Text>
    {loading && <StatusMessage kind="loading">SOS 내역을 확인하고 있습니다.</StatusMessage>}
    {!loading && !rows.length && !error && <StatusMessage kind="empty">표시할 SOS 요청이 없습니다.</StatusMessage>}
    {rows.map((row, index) => <View key={row.id} style={s.listItem}>
      <Text style={s.bodyStrong}>SOS 요청 {index + 1} · {row.acknowledged_at ? '보호자 확인 완료' : '보호자 미확인'}</Text>
      <Text style={s.bodyStrong}>{row.event_type === 'simulated_fall' ? '테스트 SOS · 가상 낙상 이벤트 (실제 신고 아님)' : '수동 SOS'}</Text>
      <Text style={s.caption}>{(() => {
        const name = names.find(item => item.counterpart_id === (actor.role === 'guardian' ? row.patient_id : row.guardian_id));
        return name ? name.display_name?.trim() || '이름 미등록' : '이름 확인 불가';
      })()} · 관계: {actor.role === 'guardian' ? '환자' : '보호자'}</Text>
      <Text style={s.caption}>요청: {new Date(row.created_at).toLocaleString()}</Text>
      <Text style={s.caption}>보호자 수신함 저장됨 · 위치: 미제공 (위치 수집·공유하지 않음)</Text>
      {row.acknowledged_at && <Text style={s.caption}>확인: {new Date(row.acknowledged_at).toLocaleString()}</Text>}
      {actor.role === 'guardian' && !row.acknowledged_at && <Action label="요청 확인 완료" danger disabled={busy} onPress={() => { void mutate(row.id); }} />}
    </View>)}
    <View style={[s.confirmation, { borderColor: '#FECACA', backgroundColor: '#FFF7F7' }]}>
      <Text style={[s.bodyStrong, { color: '#991B1B' }]}>긴급 상황에는 119로 직접 전화하세요</Text>
      <Text style={s.paragraph}>SOS는 보호자에게 보내는 요청이며 119에 자동 연결되지 않습니다. 119 버튼을 누른 뒤 전화 앱에서 직접 발신하세요.</Text>
      {actor.role === 'guardian' && <EmergencyCallButton testOnly={rows.length > 0 && rows.every(row => row.event_type === 'simulated_fall')} />}
    </View>
    </>}
  </Panel></View>;
}
