import type { SupabaseClient } from '@supabase/supabase-js';

export type SosActor = { id: string; role: 'patient' | 'guardian' };
export type SosAlert = { id: string; request_id: string; patient_id: string; guardian_id: string; created_at: string; acknowledged_at: string | null };
type Code = 'AUTH' | 'ROLE' | 'UNAVAILABLE' | 'NO_GUARDIAN' | 'RATE_LIMIT' | 'NETWORK' | 'SERVER' | 'INPUT' | 'BUSY';
export class SosError extends Error { constructor(public code: Code) { super(code); } }
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function failure(error: { code?: string; status?: number }) {
  if (error.status === 401 || error.code === 'PGRST301') return new SosError('AUTH');
  if (['42P01', '42883', 'PGRST202', 'PGRST205', '42703', 'PGRST204'].includes(error.code ?? '')) return new SosError('UNAVAILABLE');
  if (error.code === 'P0002') return new SosError('NO_GUARDIAN');
  if (error.code === 'P0001') return new SosError('RATE_LIMIT');
  if (error.code === '42501') return new SosError('ROLE');
  return new SosError('SERVER');
}
export function sosErrorMessage(error: unknown): string {
  const code = error instanceof SosError ? error.code : 'NETWORK';
  return ({ AUTH: '로그인이 만료되었습니다. 다시 로그인해 주세요.', ROLE: '현재 계정이나 연결 상태에서는 이 작업을 할 수 없습니다.',
    UNAVAILABLE: '현재 서버에서는 SOS 연결 기능을 사용할 수 없습니다.', NO_GUARDIAN: '승인된 보호자 연결이 없습니다. 연결 관리에서 승인을 확인해 주세요.',
    RATE_LIMIT: '최근 요청이 있습니다. 요청 내역을 확인하고 잠시 후 다시 시도해 주세요.',
    NETWORK: '연결을 확인하지 못했습니다. 전송·확인 결과가 불확실할 수 있으니 내역을 새로고침해 주세요.',
    SERVER: '서버에서 요청을 확인하지 못했습니다. 내역을 새로고침해 주세요.', INPUT: '요청 정보를 확인해 주세요.', BUSY: '이전 요청을 처리 중입니다.' })[code];
}
export function createSosRepository(client: SupabaseClient) {
  let writing = false;
  async function verify(actor: SosActor) {
    if (!uuid(actor.id) || !['patient', 'guardian'].includes(actor.role)) throw new SosError('INPUT');
    const { data, error } = await client.auth.getUser();
    if (error || data.user?.id !== actor.id) throw new SosError('AUTH');
  }
  async function write<T>(actor: SosActor, operation: () => Promise<T>) {
    if (writing) throw new SosError('BUSY');
    writing = true;
    try { await verify(actor); return await operation(); }
    catch (e) { throw e instanceof SosError ? e : new SosError('NETWORK'); }
    finally { writing = false; }
  }
  return {
    async list(actor: SosActor): Promise<SosAlert[]> {
      try {
        await verify(actor);
        const { data, error } = await client.from('sos_alerts')
          .select('id,request_id,patient_id,guardian_id,created_at,acknowledged_at')
          .eq(actor.role === 'patient' ? 'patient_id' : 'guardian_id', actor.id)
          .order('acknowledged_at', { ascending: true, nullsFirst: true })
          .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50);
        if (error) throw failure(error);
        if (!Array.isArray(data) || data.length > 50) throw new SosError('SERVER');
        const seen = new Set<string>();
        for (const r of data) {
          if (![r.id, r.request_id, r.patient_id, r.guardian_id].every(uuid) || seen.has(r.id)
            || r[actor.role === 'patient' ? 'patient_id' : 'guardian_id'] !== actor.id
            || r.patient_id === r.guardian_id || typeof r.created_at !== 'string' || !Number.isFinite(Date.parse(r.created_at))
            || r.acknowledged_at !== null && (typeof r.acknowledged_at !== 'string' || !Number.isFinite(Date.parse(r.acknowledged_at)) || Date.parse(r.acknowledged_at) < Date.parse(r.created_at))) throw new SosError('SERVER');
          seen.add(r.id);
        }
        return data;
      } catch (e) { throw e instanceof SosError ? e : new SosError('NETWORK'); }
    },
    send(actor: SosActor) {
      return write(actor, async () => {
        if (actor.role !== 'patient') throw new SosError('ROLE');
        const { data, error } = await client.rpc('request_sos_alert');
        if (error) throw failure(error);
        if (!Number.isInteger(data) || data < 1) throw new SosError('SERVER');
        return data as number;
      });
    },
    acknowledge(actor: SosActor, id: string) {
      return write(actor, async () => {
        if (actor.role !== 'guardian') throw new SosError('ROLE');
        if (!uuid(id)) throw new SosError('INPUT');
        const { error } = await client.rpc('acknowledge_sos_alert', { alert_id: id });
        if (error) throw failure(error);
      });
    },
  };
}
