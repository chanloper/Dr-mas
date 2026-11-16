import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { createSosRepository, sosErrorMessage, type SosActor } from '../services/sos';
import { getSupabaseClient } from '../services/supabase';
import { sosTestEnvironmentAllowed } from '../services/sosTestEnvironment';
import type { SimulationFrame } from '../features/wearable/liveSimulator';
import { EmergencyCallButton } from './EmergencyCallButton';
import { SosPanel } from './SosPanel';
import { Action, StatusMessage, s } from './ui';

export function SimulationSosBridge({ actor, event, completed }: {
  actor: SosActor; event: SimulationFrame['sosEvent']; completed: boolean;
}) {
  const [repo] = useState(() => createSosRepository(getSupabaseClient(), sosTestEnvironmentAllowed));
  const [enabled, setEnabled] = useState(false), [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState('보호자 전달 꺼짐 · 로컬 테스트만 실행합니다.');
  const [delivery, setDelivery] = useState<{ id: string; status: 'sending' | 'sent' | 'failed'; count?: number; error?: string } | null>(null);
  const attempted = useRef(new Set<string>()), active = useRef(true), writing = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function prepare() {
    if (checking) return;
    setChecking(true);
    try {
      const allowed = await repo.testAvailable(actor);
      if (!active.current) return;
      setEnabled(allowed);
      setNotice(allowed ? 'Dev 지정 테스트 계정 확인됨 · 완료된 테스트 SOS를 보호자 수신함에 저장합니다. 외부 푸시는 없습니다.'
        : '서버의 Dev 테스트 허용 설정 또는 승인된 지정 계정 연결을 확인해 주세요. 전달하지 않습니다.');
    } catch (error) { if (active.current) { setEnabled(false); setNotice(sosErrorMessage(error)); } }
    finally { if (active.current) setChecking(false); }
  }
  async function send(id: string) {
    if (!enabled || writing.current) return;
    writing.current = true;
    setDelivery({ id, status: 'sending' });
    try {
      const count = await repo.sendSimulation(actor, id);
      if (active.current) setDelivery({ id, status: 'sent', count });
    } catch (error) { if (active.current) setDelivery({ id, status: 'failed', error: sosErrorMessage(error) }); }
    finally { writing.current = false; }
  }
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; });
  useEffect(() => {
    if (!enabled || !completed || !event?.completedAt || attempted.current.has(event.id)) return;
    attempted.current.add(event.id);
    void sendRef.current(event.id);
  }, [enabled, completed, event?.id, event?.completedAt]);
  const current = delivery?.id === event?.id ? delivery : null;
  return <View style={{ gap: 10, marginVertical: 12 }}>
    <Action label={checking ? 'Dev 테스트 권한 확인 중…' : enabled ? 'Dev 테스트 보호자 전달 준비됨' : 'Dev 테스트 보호자 전달 사용'} outline disabled={checking || enabled || actor.role !== 'patient'} onPress={() => { void prepare(); }} />
    <Text style={s.caption}>{notice}</Text>
    {completed && event?.completedAt && <>
      <Text style={s.bodyStrong}>테스트 SOS 발생 · 가상 낙상 이벤트</Text>
      <Text style={s.caption}>낙상 시각: {new Date(event.occurredAt).toLocaleString()} · SOS 발생: {new Date(event.completedAt).toLocaleString()}</Text>
      <Text style={s.caption}>위치: 미제공 · 전화·문자·외부 푸시·응급기관 신고 없음</Text>
      <EmergencyCallButton testOnly />
      <StatusMessage>{current?.status === 'sent' ? `지정 보호자 ${current.count}명의 수신함 저장 확인 · 열람·대응 여부는 아래 확인 상태를 보세요.`
        : current?.status === 'sending' ? 'Dev 테스트 보호자 수신함에 저장 중…'
          : current?.status === 'failed' ? `전달을 확인하지 못했습니다. ${current.error}`
            : '보호자 미전달 · 로컬 테스트 완료. Dev 전달을 준비하지 않았거나 처리 중인 이전 이벤트가 있습니다.'}</StatusMessage>
      {enabled && current?.status !== 'sent' && current?.status !== 'sending' && <Action label="동일 테스트 SOS 전달 재시도" outline onPress={() => { void send(event.id); }} />}
      {enabled && <SosPanel key={event.id} actor={actor} historyOnly />}
    </>}
  </View>;
}
