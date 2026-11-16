import { careNameLabel } from '../services/careNames';
import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { careLinkStatus, type CareActor, type CareLink } from '../services/careLinks';
import { useCareLinks } from '../features/care/useCareLinks';
import { Action, Chip, Panel, StatusMessage, TitleRow, s } from './ui';

export function CareLinksPanel({ actor }: { actor: CareActor }) {
  return <CareLinksSession key={`${actor.id}:${actor.role}`} actor={actor} />;
}
export function CareLinksSession({ actor }: { actor: CareActor }) {
  const model = useCareLinks(actor), [target, setTarget] = useState('');
  const [confirmation, setConfirmation] = useState<{ id: string; action: 'request' | 'approve' | 'reject' | 'revoke' | 'cancel' } | null>(null);
  const patient = actor.role === 'patient';
  const pending = model.rows.filter(r => r.status === 'pending'), approved = model.rows.filter(r => r.status === 'approved');
  const history = model.rows.filter(r => r.status === 'revoked');
  const activeFor = (id: string) => model.rows.some(r => r.patient_id === id.trim().toLowerCase() && r.status !== 'revoked');
  async function confirm() {
    if (!confirmation || model.busy || !model.ready) return;
    const choice = confirmation; setConfirmation(null); await model.perform(choice.action, choice.id);
  }
  function row(link: CareLink) {
    return <View key={link.id} style={s.listItem}>
      <Text style={s.bodyStrong}>{careNameLabel(link)}</Text>
      <Text style={s.caption}>관계: {patient ? '보호자' : '환자'} · 승인된 연결에서만 등록된 이름을 확인할 수 있어요.</Text>
      <View style={{ marginTop: 8 }}><Chip text={careLinkStatus(link)} kind={link.status === 'approved' ? 'green' : 'neutral'} /></View>
      <Text style={s.caption}>요청일: {new Date(link.created_at).toLocaleDateString('ko-KR')}</Text>
      {link.status === 'revoked' && <Text style={s.caption}>종료일: {link.revoked_at ? new Date(link.revoked_at).toLocaleDateString('ko-KR') : '확인되지 않음'} · 이전 연결 이력</Text>}
      {patient && link.status === 'pending' && <View style={{ gap: 8, marginTop: 10 }}>
        <Action label="승인" small disabled={model.busy || !model.ready} onPress={() => setConfirmation({ id: link.id, action: 'approve' })} />
        <Action label="거절" small outline disabled={model.busy || !model.ready} onPress={() => setConfirmation({ id: link.id, action: 'reject' })} />
      </View>}
      {link.status !== 'revoked' && <View style={{ marginTop: 10 }}>{link.status === 'approved'
        ? <Action label="연결 해제" small outline danger disabled={model.busy || !model.ready} onPress={() => setConfirmation({ id: link.id, action: 'revoke' })} />
        : !patient && <Action label="요청 취소" small outline disabled={model.busy || !model.ready} onPress={() => setConfirmation({ id: link.id, action: 'cancel' })} />}</View>}
      {!patient && link.status === 'revoked' && <View style={{ marginTop: 10 }}>
        {activeFor(link.patient_id) ? <Text style={s.caption}>이 환자와 진행 중인 요청 또는 연결이 있습니다.</Text>
          : model.supportsReconnect && history.find(r => r.patient_id === link.patient_id)?.id === link.id && <Action label="다시 연결 요청" small outline disabled={model.busy || !model.ready}
            onPress={() => setConfirmation({ id: link.patient_id, action: 'request' })} />}
      </View>}
    </View>;
  }
  return <Panel>
    <TitleRow title={patient ? '보호자 연결 관리' : '환자 연결 관리'} />
    <Text style={[s.caption, { marginTop: 10 }]}>환자가 승인해야 보호자가 서버 복약 일정과 기록을 읽을 수 있습니다. 보호자에게 복약 변경 권한이나 위치 공유 권한을 부여하지 않습니다.</Text>
    {patient && <View style={{ marginTop: 12 }}><Text style={s.bodyStrong}>연결 요청용 내 계정 ID</Text><Text selectable style={s.caption}>{actor.id}</Text><Text style={s.caption}>연결할 보호자에게만 이 ID를 공유하세요.</Text></View>}
    {!patient && <View style={{ marginTop: 12, gap: 10 }}>
      <Text style={s.bodyStrong}>환자가 공유한 계정 ID</Text>
      <TextInput accessibilityLabel="연결할 환자 계정 ID" style={s.input} value={target} onChangeText={setTarget} placeholder="환자 계정 UUID" autoCapitalize="none" autoCorrect={false} maxLength={36} editable={!model.busy} />
      <Action label="연결 요청 보내기" disabled={model.busy || !model.ready || !target.trim() || activeFor(target)
        || !model.supportsReconnect && history.some(r => r.patient_id === target.trim().toLowerCase())} onPress={() => { void model.perform('request', target); }} />
      {activeFor(target) && <Text style={s.caption}>이 환자와 진행 중인 요청 또는 연결이 있습니다.</Text>}
    </View>}
    <View style={{ marginTop: 12 }}><Action label={model.busy ? '처리 중…' : '연결 목록 새로고침'} outline small disabled={model.busy} onPress={() => { setConfirmation(null); void model.refresh(); }} /></View>
    {model.busy && <StatusMessage kind="loading">연결 정보를 처리하고 있습니다.</StatusMessage>}
    {model.error && <StatusMessage kind="error">{model.error}</StatusMessage>}
    {model.notice && <StatusMessage>{model.notice}</StatusMessage>}
    {confirmation && <View style={s.confirmation}>
      <Text style={s.bodyStrong}>{confirmation.action === 'approve' ? '이 보호자의 복약정보 조회를 승인하시겠습니까?' : confirmation.action === 'request' ? '이 환자에게 다시 연결을 요청하시겠습니까?' : confirmation.action === 'reject' ? '연결 요청을 거절하시겠습니까?' : confirmation.action === 'cancel' ? '보낸 연결 요청을 취소하시겠습니까?' : '보호자 연결을 해제하시겠습니까?'}</Text>
      <Text style={s.caption}>{confirmation.action === 'approve' ? '환자 본인이 동의한 경우에만 승인하세요.' : confirmation.action === 'request' ? '이전 이력은 유지되며, 환자가 새 요청을 승인해야 조회할 수 있습니다.' : '승인된 연결을 해제하면 보호자의 복약정보 조회 권한도 종료됩니다.'}</Text>
      <Action label="확인하고 처리" disabled={model.busy || !model.ready} onPress={() => { void confirm(); }} />
      <Action label="취소" outline disabled={model.busy} onPress={() => setConfirmation(null)} />
    </View>}
    {model.ready && <>
      {!model.supportsReconnect && <Text style={[s.caption, { marginTop: 10 }]}>현재 서버에서는 종료된 연결의 재요청과 상세 종료 사유 확인이 지원되지 않습니다. 처음 연결하는 환자에게는 요청할 수 있습니다.</Text>}
      <Text style={[s.bodyStrong, { marginTop: 18 }]}>대기 요청 ({pending.length})</Text>{pending.map(row)}
      {pending.length === 0 && <Text style={s.caption}>대기 중인 요청이 없습니다.</Text>}
      <Text style={[s.bodyStrong, { marginTop: 18 }]}>승인된 연결 ({approved.length})</Text>{approved.map(row)}
      {approved.length === 0 && <Text style={s.caption}>승인된 연결이 없습니다.</Text>}
      <Text style={[s.bodyStrong, { marginTop: 18 }]}>이전 연결 이력 ({history.length})</Text>{history.map(row)}
      {!model.rows.length && <StatusMessage kind="empty">연결 내역이 없습니다. {patient ? '보호자가 요청을 보내면 이곳에서 승인할 수 있습니다.' : '환자가 공유한 계정 ID로 연결을 요청해 주세요.'}</StatusMessage>}
      {model.hasMore && <View style={{ marginTop: 12 }}><Text style={s.caption}>아직 불러오지 않은 내역이 있습니다.</Text><Action label="연결 내역 더 보기" outline small disabled={model.busy || !model.ready} onPress={() => { setConfirmation(null); void model.loadMore(); }} /></View>}
    </>}
  </Panel>;
}
