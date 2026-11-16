import { careNameLabel } from '../services/careNames';
import { Pressable, Text, View } from 'react-native';
import type { AuthUser } from '../services/auth';
import { useCareLinks } from '../features/care/useCareLinks';
import { useCloudMedications } from '../features/medications/useCloudMedications';
import { Action, AppIcon, C, Chip, Panel, StatusMessage, s } from './ui';

// Only approved counterpart names are supplied by the permission-scoped hook.
export function PatientConnectionsSummary({ patientId, onManage, compact = false }: { patientId: string; onManage: () => void; compact?: boolean }) {
  const links = useCareLinks({ id: patientId, role: 'patient' });
  const approved = links.ready ? links.rows.filter(row => row.status === 'approved').length : 0;
  const pending = links.ready ? links.rows.filter(row => row.status === 'pending').length : 0;
  if (compact) return <Pressable accessibilityRole="button" accessibilityLabel="가족 연결 요약 · 연결 관리 열기" onPress={onManage} style={[s.panel, { flex: 1, minHeight: 164, gap: 8 }]}>
    <AppIcon name="family" color={C.green} /><Text style={s.bodyStrong}>가족 연결</Text>
    <Text style={[s.sectionTitle, { color: C.green }]}>{links.ready ? `승인 ${approved}건` : '확인 중'}</Text>
    <Text style={s.caption}>{links.error ? '조회 오류 · 관리에서 확인' : links.ready ? pending ? `승인 대기 ${pending}건` : approved ? '승인된 연결 기준' : '승인된 연결 없음' : '계정 연결 확인'}</Text>
    <Text style={[s.caption, { color: C.blue }]}>관리하기 ›</Text>
  </Pressable>;
  return <Panel style={{ backgroundColor: C.white }}>
    <View style={s.row}>
      <View style={[s.serviceIcon, { backgroundColor: C.mint }]}><AppIcon name="family" color={C.green} /></View>
      <View style={{ flex: 1, minWidth: 0 }}><Text style={s.sectionTitle}>연동 보호자 안심망</Text><Text style={s.caption}>승인된 가족 연결 상태를 확인해요.</Text></View>
    </View>
    {links.busy && <StatusMessage kind="loading">가족 연결을 확인하고 있어요.</StatusMessage>}
    {links.error && <StatusMessage kind="error">{links.error}</StatusMessage>}
    {links.ready && <Text style={[s.paragraph, { marginTop: 12 }]}>{approved ? `불러온 승인 연결 ${approved}건` : '불러온 목록에 승인된 가족이 없어요.'}{pending ? ` · 승인 대기 ${pending}건` : ''}</Text>}
    {links.hasMore && <Text style={s.caption}>다른 연결은 연결 관리에서 확인해 주세요.</Text>}
    <View style={{ marginTop: 12 }}><Action label="가족 연결 관리" outline pressScale onPress={onManage} /></View>
  </Panel>;
}
export function ConnectedFamilySummary({ guardianId, onManage, onMedication }: { guardianId: string; onManage: () => void; onMedication: () => void }) {
  const links = useCareLinks({ id: guardianId, role: 'guardian' });
  const approved = links.ready ? links.rows.filter(row => row.status === 'approved') : [];
  return <Panel>
    {links.busy && <StatusMessage kind="loading">가족 연결을 확인하고 있습니다.</StatusMessage>}
    {links.error && <StatusMessage kind="error">{links.error}</StatusMessage>}
    {links.ready && !approved.length && <StatusMessage kind="empty">불러온 목록에 승인된 가족이 없습니다. 연결 관리에서 환자에게 연결을 요청해 주세요.</StatusMessage>}
    {approved.length > 0 && <>
      <Text style={s.caption}>불러온 승인 연결 {approved.length}건</Text>
      {approved.slice(0, 3).map(row => <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`${careNameLabel(row)}, 환자, 승인됨, 가족 연결 관리 열기`} onPress={onManage} style={s.listItem}>
        <View style={s.rowBetween}><Text style={s.bodyStrong}>{careNameLabel(row)}</Text><Chip text="승인됨" kind="green" /></View>
        <Text style={s.caption}>관계: 환자 · 선택하면 가족 연결 관리로 이동합니다.</Text>
      </Pressable>)}
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

export function PatientMedicationSummary({ user, onOpen, compact = false }: { user: AuthUser; onOpen: () => void; compact?: boolean }) {
  const cloud = useCloudMedications(user);
  const schedules = cloud.ready ? cloud.schedules.filter(row => row.active) : [];
  const completed = schedules.filter(row => cloud.records.some(record => record.medication_id === row.id && record.taken)).length;
  if (compact) return <Pressable accessibilityRole="button" accessibilityLabel="복약 요약 · 복약 관리 열기" onPress={onOpen} style={[s.panel, { flex: 1, minHeight: 164, gap: 8 }]}>
    <AppIcon name="medication" color={C.blue} /><Text style={s.bodyStrong}>오늘의 복약</Text>
    <Text style={[s.sectionTitle, { color: C.blue }]}>{cloud.ready ? `${completed} / ${schedules.length} 완료` : '확인 중'}</Text>
    <Text style={s.caption}>{cloud.error ? '조회 오류 · 관리에서 확인' : cloud.ready ? schedules.length ? '불러온 활성 일정 기준' : '등록 일정 없음' : '계정 기록 확인'}</Text>
    <Text style={[s.caption, { color: C.blue }]}>기록 보기 ›</Text>
  </Pressable>;
  return <View style={s.sectionGap}>
    <Panel style={{ backgroundColor: C.white }}>
      <View style={[s.row, { marginBottom: 10 }]}>
        <View style={s.serviceIcon}><AppIcon name="medication" color={C.blue} /></View>
        <View style={{ flex: 1, minWidth: 0 }}><Text style={s.sectionTitle}>오늘의 복약 일정</Text><Text style={s.caption}>{cloud.ready ? `${cloud.day} · 한국 시간` : '계정 기록 확인'}</Text></View>
      </View>
      {cloud.busy && <StatusMessage kind="loading">계정의 복약 일정과 기록을 확인하고 있습니다.</StatusMessage>}
      {cloud.error && <StatusMessage kind="error">{cloud.error}</StatusMessage>}
      {cloud.ready && !schedules.length && <StatusMessage kind="empty">등록된 활성 복약 일정이 없습니다. 복약 관리에서 의료진의 안내에 따라 일정을 등록해 보세요.</StatusMessage>}
      {schedules.length > 0 && <>
        <View style={s.rowBetween}><Text style={s.bodyStrong}>불러온 일정 {schedules.length}개</Text><Chip text={`완료 기록 ${completed}개`} kind="green" /></View>
        <View accessibilityRole="progressbar" accessibilityLabel="불러온 활성 복약 일정의 완료 비율" accessibilityValue={{ min: 0, max: schedules.length, now: completed }} style={s.progressTrack}><View style={[s.progressFill, { width: `${completed / schedules.length * 100}%`, backgroundColor: C.green }]} /></View>
        {schedules.slice(0, 3).map(row => {
          const taken = cloud.records.some(record => record.medication_id === row.id && record.taken);
          return <View key={row.id} style={{ marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: C.pale }}>
            <View style={s.rowBetween}>
              <View style={{ flex: 1, minWidth: 0 }}><Text style={s.bodyStrong}>{row.title}</Text><Text style={s.caption}>{row.time_local.slice(0, 5)} · {row.timezone}</Text></View>
              <Chip text={taken ? '복용 완료' : '예정'} kind={taken ? 'green' : 'blue'} />
            </View>
            <Text style={[s.caption, { marginTop: 4 }]}>{taken ? '오늘 복약 완료 기록이 있어요.' : '오늘 복약 완료 기록이 없어요.'}</Text>
          </View>;
        })}
      </>}
      <View style={{ marginTop: 16, gap: 10 }}><Action label="복약 일정·기록 관리" pressScale onPress={onOpen} /><Action label="오늘의 기록 새로고침" small outline disabled={cloud.busy} pressScale onPress={cloud.refresh} /></View>
    </Panel>
  </View>;
}
