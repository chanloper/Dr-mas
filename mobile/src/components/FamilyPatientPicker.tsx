import { careNameLabel } from '../services/careNames';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useCareLinks } from '../features/care/useCareLinks';
import type { CareLink } from '../services/careLinks';
import { FeatureModal } from './FeatureModal';
import { Action, StatusMessage, s } from './ui';

export function FamilyPatientPicker({ guardianId }: { guardianId: string }) {
  const model = useCareLinks({ id: guardianId, role: 'guardian' });
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<CareLink | null>(null);
  const approved = model.rows.filter(row => row.status === 'approved');
  const current = model.ready ? approved.find(row => row.id === selected?.id) : undefined;
  return <View style={{ gap: 8, marginTop: 14 }}>
    <Text style={s.bodyStrong}>조회 대상 환자</Text>
    <Action outline label={current ? `${careNameLabel(current)} · 환자 · 승인됨` : '승인된 환자 선택'} onPress={() => setOpen(true)} />
    <Text style={s.caption}>연결 승인이 확인된 목록만 표시합니다. 건강 정보·원격 설정은 아직 연결되지 않았습니다.</Text>
    <FeatureModal visible={open} title="승인된 환자 선택" onClose={() => setOpen(false)}>
      {model.busy && <StatusMessage kind="loading">연결을 확인하고 있습니다.</StatusMessage>}
      {model.error && <StatusMessage kind="error">{model.error}</StatusMessage>}
      {model.ready && !approved.length && <StatusMessage kind="empty">이 목록에 승인된 환자가 없습니다. 연결 관리에서 승인 상태를 확인해 주세요.</StatusMessage>}
      {approved.map(row => <Action key={row.id} outline label={`${careNameLabel(row)} · 환자 · 승인됨${row.id === current?.id ? ' · 선택됨' : ''}`} onPress={() => { setSelected(row); setOpen(false); }} />)}
      {model.hasMore && <Action label="연결 더 보기" outline disabled={model.busy} onPress={() => { void model.loadMore(); }} />}
      <Action label="목록 새로고침" outline disabled={model.busy} onPress={() => { void model.refresh(); }} />
    </FeatureModal>
  </View>;
}
