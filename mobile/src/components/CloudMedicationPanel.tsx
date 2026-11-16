import { careNameLabel } from '../services/careNames';
import { useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { Action, C, Field, Panel, StatusMessage, s } from './ui';
import { useDrMAS } from '../features/app/context';
import { koreaDay, useCloudMedications } from '../features/medications/useCloudMedications';
import { useCareLinks } from '../features/care/useCareLinks';
import { getSupabaseClient } from '../services/supabase';
import type { AuthUser } from '../services/auth';
import { createMedicationRepository, validateDay, type CloudSchedule, type CloudRecord } from '../services/medicationRepository';

function GuardianCloudMedications({ user }: { user: AuthUser }) {
  const links = useCareLinks({ id: user.id, role: 'guardian' });
  const [patient, setPatient] = useState(''), [reload, setReload] = useState(0);
  const [data, setData] = useState<{ patient: string; day: string; schedules: CloudSchedule[]; records: CloudRecord[] } | null>(null);
  const [error, setError] = useState(false), [busy, setBusy] = useState(false);
  const approved = links.rows.filter(row => row.status === 'approved');
  const allowed = links.ready && approved.some(row => row.patient_id === patient);
  useEffect(() => {
    let active = true, generation = 0, loading = false;
    async function load() {
      if (loading) return;
      const epoch = ++generation;
      setData(null); setError(false); setBusy(false);
      if (!allowed || AppState.currentState && AppState.currentState !== 'active') return;
      loading = true; setBusy(true);
      try {
        const client = getSupabaseClient();
        const auth = await client.auth.getUser();
        if (auth.error || auth.data.user?.id !== user.id) throw Error();
        const repository = createMedicationRepository(client), day = koreaDay();
        // Every read uses the signed-in guardian JWT and the existing database RLS.
        const [schedules, records] = await Promise.all([repository.list(patient), repository.records(patient, day)]);
        if (active && epoch === generation) setData({ patient, day, schedules, records });
      } catch { if (active && epoch === generation) { setData(null); setError(true); } }
      finally { loading = false; if (active && epoch === generation) setBusy(false); }
    }
    void load();
    const timer = setInterval(() => { void load(); }, 15000);
    const subscription = AppState.addEventListener('change', state => {
      generation++; setData(null); setBusy(false);
      if (state === 'active') { loading = false; void load(); }
    });
    return () => { active = false; generation++; clearInterval(timer); subscription.remove(); };
  }, [allowed, patient, reload, user.id]);
  return <Panel style={{ marginTop: 20 }}>
    <Text style={s.sectionTitle}>승인된 가족의 복약</Text>
    <Text style={s.paragraph}>환자가 승인한 범위에서 오늘의 복약 정보를 조회합니다. 이 화면에서 15초마다 다시 확인합니다.</Text>
    {links.busy && <StatusMessage kind="loading">승인된 연결을 확인하고 있습니다.</StatusMessage>}
    {links.error && <StatusMessage kind="error">{links.error}</StatusMessage>}
    {links.ready && approved.length === 0 && <StatusMessage kind="empty">승인된 연결이 없습니다. 설정의 가족 연결 관리에서 확인해 주세요.</StatusMessage>}
    {approved.map(row => <View key={row.id} style={{ marginTop: 8 }}><Action small outline label={`${careNameLabel(row)} · 환자 · 승인됨${patient === row.patient_id ? ' · 선택됨' : ''}`} onPress={() => { setData(null); setPatient(row.patient_id); }} /></View>)}
    {links.hasMore && <Action small outline label="연결 더 보기" disabled={links.busy} onPress={() => { void links.loadMore(); }} />}
    <View style={{ marginVertical: 12 }}><Action small outline label="다시 불러오기" onPress={() => { setData(null); links.refresh(); setReload(value => value + 1); }} /></View>
    {busy && <StatusMessage kind="loading">복약 정보를 확인하고 있습니다.</StatusMessage>}
    {error && <StatusMessage kind="error">복약 정보를 확인하지 못했습니다. 로그인 및 연결 승인 상태를 확인해 주세요.</StatusMessage>}
    {links.ready && approved.length > 0 && !patient && <StatusMessage>조회할 환자를 위 목록에서 선택해 주세요.</StatusMessage>}
    {allowed && data?.patient === patient && <>
      <Text style={s.caption}>{data.day} · 한국 시간 기준</Text>
      {data.schedules.filter(row => row.active).length === 0 && <Text style={s.paragraph}>조회 가능한 활성 복약 일정이 없습니다. 연결이 해제된 경우에도 표시되지 않습니다.</Text>}
      {data.schedules.filter(row => row.active).map(row => <View key={row.id} style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: C.line }}>
        <Text style={s.bodyStrong}>{row.title}</Text><Text style={s.caption}>{row.time_local.slice(0, 5)}</Text>
        {!!row.detail && <Text style={s.paragraph}>{row.detail}</Text>}
        <Text style={s.paragraph}>{data.records.some(record => record.medication_id === row.id && record.taken) ? '복약 완료' : '완료 기록 없음'}</Text>
      </View>)}
    </>}
  </Panel>;
}

function PatientCloudMedications({ user }: { user: AuthUser }) {
  const cloud = useCloudMedications(user);
  const [title, setTitle] = useState(''), [detail, setDetail] = useState(''), [time, setTime] = useState('08:00');
  const [editing, setEditing] = useState<string | null>(null), [showArchived, setShowArchived] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [dateInput, setDateInput] = useState(cloud.day), [dateError, setDateError] = useState<string | null>(null);
  function applyDate() { try { validateDay(dateInput); setDateError(null); cloud.changeDay(dateInput); } catch { setDateError('올바른 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.'); } }
  function reset() { setEditing(null); setTitle(''); setDetail(''); setTime('08:00'); }
  function edit(row: CloudSchedule) { setEditing(row.id); setTitle(row.title); setDetail(row.detail); setTime(row.time_local.slice(0, 5)); }
  async function save() { if (await cloud.mutate(editing ? 'update' : 'create', editing ?? '', { title, detail, time_local: time })) reset(); }
  return <Panel style={{ marginTop: 20 }}>
    <Text style={s.sectionTitle}>계정에 저장한 복약</Text>
    <Text style={[s.paragraph, { marginVertical: 10 }]}>직접 등록한 일정과 복약 기록을 계정에 저장합니다. 아래의 기기 기록은 자동으로 옮기지 않습니다.</Text>
    <Field label="기록 날짜 (YYYY-MM-DD)" value={dateInput} onChangeText={setDateInput} editable={!cloud.busy} autoCapitalize="none" autoCorrect={false} maxLength={10} />
    <Action label="날짜 적용" small outline disabled={cloud.busy} onPress={applyDate} />
    {dateError && <Text accessibilityRole="alert" style={{ color: C.danger }}>{dateError}</Text>}
    <Text style={s.caption}>현재 기록 날짜: {cloud.day}</Text>
    <Text style={s.caption}>기본 날짜와 새 일정은 한국 시간 기준입니다. 체크 기록은 선택한 날짜에 저장됩니다.</Text>
    {cloud.busy && <StatusMessage kind="loading">계정의 복약 정보를 처리하고 있습니다.</StatusMessage>}
    {cloud.error && <StatusMessage kind="error">{cloud.error}</StatusMessage>}
    <View style={{ marginVertical: 10 }}><Action label="계정 기록 다시 불러오기" outline small disabled={cloud.busy} onPress={cloud.refresh} /></View>
    {cloud.ready && cloud.schedules.filter(row => row.active).length === 0 && <StatusMessage kind="empty">등록한 복약 일정이 없습니다. 아래에서 의료진의 지시에 따라 일정을 등록해 주세요.</StatusMessage>}
    {cloud.schedules.filter(row => showArchived || row.active).map(row => {
      const taken = cloud.records.find(record => record.medication_id === row.id)?.taken ?? false;
      return <View key={row.id} style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: C.line, gap: 8 }}>
        <Text style={s.bodyStrong}>{row.title}{!row.active ? ' · 종료된 일정' : ''}</Text>
        <Text style={s.caption}>{row.time_local.slice(0, 5)} · {row.timezone}</Text>
        {!!row.detail && <Text style={s.paragraph}>{row.detail}</Text>}
        {row.active && <Action label={taken ? '복약 완료 · 취소하기' : '복약 완료로 기록'} disabled={cloud.busy || !cloud.ready} onPress={() => { void cloud.mutate('mark', row.id, !taken); }} small />}
        {!row.active && <Text style={s.paragraph}>{cloud.day} · {taken ? '복약 완료' : '완료 기록 없음'}</Text>}
        <View style={[s.row, { gap: 8, flexWrap: 'wrap' }]}>
          <Action label="수정" outline small disabled={cloud.busy || !cloud.ready} onPress={() => edit(row)} />
          <Action label={row.active ? '일정 보관' : '일정 복원'} outline small disabled={cloud.busy || !cloud.ready} onPress={() => { void cloud.mutate('archive', row.id, !row.active); }} />
          {row.active && <Action label="삭제" outline small danger disabled={cloud.busy || !cloud.ready} onPress={() => setRemoving(row.id)} />}
        </View>
        {removing === row.id && <View style={s.confirmation}>
          <Text style={s.paragraph}>이 복약 일정을 삭제하시겠어요? 처방받은 약은 임의로 중단하지 말고 의사나 약사와 상담하세요.</Text>
          <Text style={s.caption}>활성 목록에서 제거하며 과거 복약 기록은 남겨요. 지난 일정과 기록 보기에서 확인할 수 있어요.</Text>
          <Action label="삭제 확인" danger small disabled={cloud.busy || !cloud.ready} onPress={() => { void (async () => { if (await cloud.mutate('remove', row.id, false)) { if (editing === row.id) reset(); setRemoving(null); } })(); }} />
          <Action label="취소" outline small disabled={cloud.busy} onPress={() => setRemoving(null)} />
        </View>}
      </View>;
    })}
    <View style={{ marginVertical: 12 }}><Action label={showArchived ? '현재 일정만 보기' : '지난 일정과 기록 보기'} outline small onPress={() => setShowArchived(value => !value)} /></View>
    <Text style={s.bodyStrong}>{editing ? '일정 수정' : '새 일정 등록'}</Text>
    <Field label="일정 이름" value={title} onChangeText={setTitle} maxLength={200} editable={cloud.ready && !cloud.busy} />
    <Field label="복약 안내" value={detail} onChangeText={setDetail} maxLength={2000} editable={cloud.ready && !cloud.busy} multiline />
    <Field label="복약 시간 (HH:mm)" value={time} onChangeText={setTime} maxLength={5} editable={cloud.ready && !cloud.busy} autoCorrect={false} />
    <Action label={editing ? '변경 저장' : '일정 등록'} disabled={!cloud.ready || cloud.busy} onPress={() => { void save(); }} />
    {editing && <View style={{ marginTop: 8 }}><Action label="수정 취소" outline small disabled={cloud.busy} onPress={reset} /></View>}
    <Text style={[s.caption, { marginTop: 12 }]}>일정 삭제·보관은 과거 복약 기록을 영구 삭제하지 않습니다. 약품이나 복용량을 추천하는 기능은 아닙니다.</Text>
  </Panel>;
}
export function CloudMedicationPanel() {
  const { user } = useDrMAS();
  if (!user) return null;
  if (user.role === 'guardian') return <GuardianCloudMedications key={user.id} user={user} />;
  return <PatientCloudMedications key={user.id} user={user} />;
}
