import { useState } from 'react';
import { Text, View } from 'react-native';
import { Action, C, Field, Panel, s } from './ui';
import { useDrMAS } from '../features/app/context';
import { useCloudMedications } from '../features/medications/useCloudMedications';
import type { AuthUser } from '../services/auth';
import { validateDay, type CloudSchedule } from '../services/medicationRepository';

function PatientCloudMedications({ user }: { user: AuthUser }) {
  const cloud = useCloudMedications(user);
  const [title, setTitle] = useState(''), [detail, setDetail] = useState(''), [time, setTime] = useState('08:00');
  const [editing, setEditing] = useState<string | null>(null), [showArchived, setShowArchived] = useState(false);
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
    {cloud.busy && <Text accessibilityLiveRegion="polite" style={s.paragraph}>계정의 복약 정보를 처리하고 있습니다.</Text>}
    {cloud.error && <Text accessibilityRole="alert" style={[s.paragraph, { color: C.danger, marginVertical: 10 }]}>{cloud.error}</Text>}
    <View style={{ marginVertical: 10 }}><Action label="계정 기록 다시 불러오기" outline small disabled={cloud.busy} onPress={cloud.refresh} /></View>
    {cloud.ready && cloud.schedules.filter(row => row.active).length === 0 && <Text style={s.paragraph}>등록한 복약 일정이 없습니다. 의료진의 지시에 따라 일정을 등록해 주세요.</Text>}
    {cloud.schedules.filter(row => showArchived || row.active).map(row => {
      const taken = cloud.records.find(record => record.medication_id === row.id)?.taken ?? false;
      return <View key={row.id} style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: C.line, gap: 8 }}>
        <Text style={s.bodyStrong}>{row.title}{!row.active ? ' · 보관됨' : ''}</Text>
        <Text style={s.caption}>{row.time_local.slice(0, 5)} · {row.timezone}</Text>
        {!!row.detail && <Text style={s.paragraph}>{row.detail}</Text>}
        {row.active && <Action label={taken ? '복약 완료 · 취소하기' : '복약 완료로 기록'} disabled={cloud.busy || !cloud.ready} onPress={() => { void cloud.mutate('mark', row.id, !taken); }} small />}
        <View style={[s.row, { gap: 8, flexWrap: 'wrap' }]}>
          <Action label="수정" outline small disabled={cloud.busy || !cloud.ready} onPress={() => edit(row)} />
          <Action label={row.active ? '일정 보관' : '일정 복원'} outline small disabled={cloud.busy || !cloud.ready} onPress={() => { void cloud.mutate('archive', row.id, !row.active); }} />
        </View>
      </View>;
    })}
    <View style={{ marginVertical: 12 }}><Action label={showArchived ? '현재 일정만 보기' : '보관한 일정도 보기'} outline small onPress={() => setShowArchived(value => !value)} /></View>
    <Text style={s.bodyStrong}>{editing ? '일정 수정' : '새 일정 등록'}</Text>
    <Field label="일정 이름" value={title} onChangeText={setTitle} maxLength={200} editable={cloud.ready && !cloud.busy} />
    <Field label="복약 안내" value={detail} onChangeText={setDetail} maxLength={2000} editable={cloud.ready && !cloud.busy} multiline />
    <Field label="복약 시간 (HH:mm)" value={time} onChangeText={setTime} maxLength={5} editable={cloud.ready && !cloud.busy} autoCorrect={false} />
    <Action label={editing ? '변경 저장' : '일정 등록'} disabled={!cloud.ready || cloud.busy} onPress={() => { void save(); }} />
    {editing && <View style={{ marginTop: 8 }}><Action label="수정 취소" outline small disabled={cloud.busy} onPress={reset} /></View>}
    <Text style={[s.caption, { marginTop: 12 }]}>보관은 기존 복약 기록을 삭제하지 않습니다. 약품이나 복용량을 추천하는 기능은 아닙니다.</Text>
  </Panel>;
}
export function CloudMedicationPanel() {
  const { user } = useDrMAS();
  if (!user) return null;
  if (user.role !== 'patient') return <Panel style={{ marginTop: 20 }}><Text style={s.paragraph}>환자 계정에서 복약 일정을 관리할 수 있습니다. 보호자의 서버 복약 조회 화면은 연결 승인 확인 후 제공될 예정입니다.</Text></Panel>;
  return <PatientCloudMedications key={user.id} user={user} />;
}
