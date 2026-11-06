import { Text, View } from 'react-native';
import type { AuthUser } from '../services/auth';
import { useCareLinks } from '../features/care/useCareLinks';
import { useCloudMedications } from '../features/medications/useCloudMedications';
import { Action, C, Chip, Panel, StatusMessage, TitleRow, s } from './ui';

// Presentation of existing repositories only; no new RPCs, writes or profile access.
export function ConnectedFamilySummary({ guardianId, onManage, onMedication }: { guardianId: string; onManage: () => void; onMedication: () => void }) {
  const links = useCareLinks({ id: guardianId, role: 'guardian' });
  const approved = links.ready ? links.rows.filter(row => row.status === 'approved') : [];
  return <Panel>
    {links.busy && <StatusMessage kind="loading">가족 연결을 확인하고 있습니다.</StatusMessage>}
    {links.error && <StatusMessage kind="error">{links.error}</StatusMessage>}
    {links.ready && !approved.length && <StatusMessage kind="empty">불러온 목록에 승인된 가족이 없습니다. 연결 관리에서 환자에게 연결을 요청해 주세요.</StatusMessage>}
    {approved.length > 0 && <>
      <Text style={s.caption}>불러온 승인 연결 {approved.length}건 · 환자의 승인 범위에서만 조회합니다.</Text>
      {approved.slice(0, 3).map((row, index) => <View key={row.id} style={s.listItem}>
        <View style={s.rowBetween}><Text style={s.bodyStrong}>연결된 환자 {index + 1}</Text><Chip text="승인됨" kind="green" /></View>
        <Text style={s.caption}>계정 끝 {row.patient_id.slice(-4)} · 복약 화면에서 조회할 환자를 선택하세요.</Text>
      </View>)}
      {approved.length > 3 && <Text style={s.caption}>다른 승인 연결은 가족 연결 관리에서 확인하세요.</Text>}
    </>}
    {links.hasMore && <Text style={s.caption}>아직 불러오지 않은 연결·이력이 있습니다. 연결 관리에서 더 확인할 수 있습니다.</Text>}
    <View style={{ gap: 10, marginTop: 16 }}>
      <Action label="가족 복약 조회" disabled={!links.ready || !approved.length} onPress={onMedication} />
      <Action label="가족 연결 관리" outline onPress={onManage} />
      <Action label="연결 목록 새로고침" outline small disabled={links.busy} onPress={() => { void links.refresh(); }} />
    </View>
  </Panel>;
}

export function PatientMedicationSummary({ user, onOpen }: { user: AuthUser; onOpen: () => void }) {
  const cloud = useCloudMedications(user);
  const schedules = cloud.ready ? cloud.schedules.filter(row => row.active) : [];
  const completed = schedules.filter(row => cloud.records.some(record => record.medication_id === row.id && record.taken)).length;
  return <View style={s.sectionGap}>
    <TitleRow title="오늘의 복약" accessory={cloud.ready ? `${cloud.day} · 한국 시간` : '계정 기록 확인'} />
    <Panel>
      {cloud.busy && <StatusMessage kind="loading">계정의 복약 일정과 기록을 확인하고 있습니다.</StatusMessage>}
      {cloud.error && <StatusMessage kind="error">{cloud.error}</StatusMessage>}
      {cloud.ready && !schedules.length && <StatusMessage kind="empty">등록된 활성 복약 일정이 없습니다. 복약 관리에서 의료진의 안내에 따라 일정을 등록해 보세요.</StatusMessage>}
      {schedules.length > 0 && <>
        <View style={s.rowBetween}><Text style={s.bodyStrong}>불러온 일정 {schedules.length}개</Text><Chip text={`완료 기록 ${completed}개`} kind="green" /></View>
        <View accessibilityRole="progressbar" accessibilityLabel="불러온 활성 복약 일정의 완료 비율" accessibilityValue={{ min: 0, max: schedules.length, now: completed }} style={s.progressTrack}><View style={[s.progressFill, { width: `${completed / schedules.length * 100}%`, backgroundColor: C.green }]} /></View>
        {schedules.slice(0, 3).map(row => <View key={row.id} style={s.listItem}>
          <View style={s.rowBetween}><Text style={s.bodyStrong}>{row.title}</Text><Text style={s.timeText}>{row.time_local.slice(0, 5)}</Text></View>
          <Text style={s.caption}>{cloud.records.some(record => record.medication_id === row.id && record.taken) ? '복약 완료 기록 있음' : '완료 기록 없음'} · {row.timezone}</Text>
        </View>)}
      </>}
      <View style={{ marginTop: 16, gap: 10 }}><Action label="복약 일정·기록 관리" onPress={onOpen} /><Action label="오늘의 기록 새로고침" small outline disabled={cloud.busy} onPress={cloud.refresh} /></View>
    </Panel>
  </View>;
}
