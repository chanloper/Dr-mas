import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { CareActor, CareLink } from '../services/careLinks';
import { useCareLinks } from '../features/care/useCareLinks';
import { Action, Chip, Panel, TitleRow, s } from './ui';

export function CareLinksPanel({ actor }: { actor: CareActor }) {
  return <CareLinksSession key={`${actor.id}:${actor.role}`} actor={actor} />;
}
export function CareLinksSession({ actor }: { actor: CareActor }) {
  const model = useCareLinks(actor), [target, setTarget] = useState('');
  const [confirmation, setConfirmation] = useState<{ id: string; action: 'approve' | 'reject' | 'revoke' | 'cancel' } | null>(null);
  const patient = actor.role === 'patient';
  const pending = model.rows.filter(r => r.status === 'pending'), approved = model.rows.filter(r => r.status === 'approved');
  async function confirm() {
    if (!confirmation || model.busy || !model.ready) return;
    const choice = confirmation; setConfirmation(null); await model.perform(choice.action, choice.id);
  }
  function row(link: CareLink) {
    return <View key={link.id} style={{ marginTop: 14 }}>
      <Text style={s.bodyStrong}>{patient ? '보호자' : '환자'} 계정 ID</Text>
      <Text selectable style={s.caption}>{patient ? link.guardian_id : link.patient_id}</Text>
      <View style={{ marginTop: 8 }}><Chip text={link.status === 'approved' ? '승인됨' : '승인 대기'} kind={link.status === 'approved' ? 'green' : 'neutral'} /></View>
      {patient && link.status === 'pending' && <View style={{ gap: 8, marginTop: 10 }}>
        <Action label="승인" small disabled={model.busy || !model.ready} onPress={() => setConfirmation({ id: link.id, action: 'approve' })} />
        <Action label="거절" small outline disabled={model.busy || !model.ready} onPress={() => setConfirmation({ id: link.id, action: 'reject' })} />
      </View>}
      <View style={{ marginTop: 10 }}>{link.status === 'approved'
        ? <Action label="연결 해제" small outline danger disabled={model.busy || !model.ready} onPress={() => setConfirmation({ id: link.id, action: 'revoke' })} />
        : !patient && <Action label="요청 취소" small outline disabled={model.busy || !model.ready} onPress={() => setConfirmation({ id: link.id, action: 'cancel' })} />}</View>
    </View>;
  }
  return <Panel>
    <TitleRow title={patient ? '보호자 연결 관리' : '환자 연결 관리'} />
    <Text style={[s.caption, { marginTop: 10 }]}>환자가 승인해야 보호자가 서버 복약 일정과 기록을 읽을 수 있습니다. 보호자에게 복약 변경 권한이나 위치 공유 권한을 부여하지 않습니다.</Text>
    {patient && <View style={{ marginTop: 12 }}><Text style={s.bodyStrong}>연결 요청용 내 계정 ID</Text><Text selectable style={s.caption}>{actor.id}</Text><Text style={s.caption}>연결할 보호자에게만 이 ID를 공유하세요.</Text></View>}
    {!patient && <View style={{ marginTop: 12, gap: 10 }}>
      <Text style={s.bodyStrong}>환자가 공유한 계정 ID</Text>
      <TextInput accessibilityLabel="연결할 환자 계정 ID" style={s.input} value={target} onChangeText={setTarget} placeholder="환자 계정 UUID" autoCapitalize="none" autoCorrect={false} maxLength={36} editable={!model.busy} />
      <Action label="연결 요청 보내기" disabled={model.busy || !model.ready || !target.trim()} onPress={() => { void model.perform('request', target); }} />
    </View>}
    <View style={{ marginTop: 12 }}><Action label={model.busy ? '처리 중…' : '연결 목록 새로고침'} outline small disabled={model.busy} onPress={() => { setConfirmation(null); void model.refresh(); }} /></View>
    {model.error && <Text accessibilityRole="alert" style={[s.caption, { marginTop: 10 }]}>{model.error}</Text>}
    {model.notice && <Text style={[s.caption, { marginTop: 10 }]}>{model.notice}</Text>}
    {confirmation && <View style={{ marginTop: 16, gap: 8 }}>
      <Text style={s.bodyStrong}>{confirmation.action === 'approve' ? '이 보호자의 복약정보 조회를 승인하시겠습니까?' : '이 연결 요청을 거절하거나 연결을 해제하시겠습니까?'}</Text>
      <Text style={s.caption}>{confirmation.action === 'approve' ? '환자 본인이 동의한 경우에만 승인하세요.' : '현재 구조에서는 거절·해제한 동일 상대에게 다시 요청할 수 없습니다.'}</Text>
      <Action label="확인하고 처리" disabled={model.busy || !model.ready} onPress={() => { void confirm(); }} />
      <Action label="취소" outline disabled={model.busy} onPress={() => setConfirmation(null)} />
    </View>}
    {model.ready && <>
      <Text style={[s.bodyStrong, { marginTop: 18 }]}>대기 중인 요청 ({pending.length})</Text>{pending.map(row)}
      <Text style={[s.bodyStrong, { marginTop: 18 }]}>승인된 연결 ({approved.length})</Text>{approved.map(row)}
      {!pending.length && !approved.length && <Text style={[s.caption, { marginTop: 10 }]}>현재 대기 중이거나 승인된 연결이 없습니다.</Text>}
      {model.rows.some(r => r.status === 'revoked') && <Text style={[s.caption, { marginTop: 10 }]}>거절·해제 이력이 있습니다. 동일 상대에게 재요청하는 기능은 아직 지원하지 않습니다.</Text>}
    </>}
  </Panel>;
}
