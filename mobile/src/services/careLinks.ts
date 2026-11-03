import type { SupabaseClient } from '@supabase/supabase-js';
export type CareActor = { id: string; role: 'patient' | 'guardian' };
export type CareLink = {
  id: string; patient_id: string; guardian_id: string; requested_by: string;
  status: 'pending' | 'approved' | 'revoked'; approved_by: string | null;
  approved_at: string | null; revoked_at: string | null; created_at: string;
};
export class CareLinkError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const messages: Record<string, string> = {
  INPUT: '올바른 환자 계정 ID를 입력해 주세요.', SELF: '자신에게 연결을 요청할 수 없습니다.',
  ROLE: '현재 계정 역할로는 이 작업을 할 수 없습니다.', AUTH: '로그인이 만료됐거나 계정이 변경됐습니다. 다시 로그인해 주세요.',
  DUPLICATE: '이미 요청·승인·해제 이력이 있는 연결입니다. 목록을 새로고침해 주세요. 현재 해제한 상대에게 재요청은 지원하지 않습니다.',
  TARGET: '연결을 요청할 수 없습니다. 환자 ID와 계정 역할, 연결 권한을 확인해 주세요.',
  STALE: '요청 상태가 바뀌었거나 처리 권한이 없습니다. 목록을 새로고침해 주세요.',
  NETWORK: '연결 상태를 확인하지 못했습니다. 요청을 반복하지 말고 목록을 새로고침해 주세요.',
  SERVER: '서버에서 연결 요청을 처리하지 못했습니다. 목록을 새로고침해 주세요.',
  RESPONSE: '서버의 연결 정보를 확인하지 못했습니다. 목록을 새로고침해 주세요.',
  LIMIT: '표시 가능한 연결 내역 수를 초과했습니다. 관리자에게 문의해 주세요.',
};
function fail(code: string): never { throw new CareLinkError(code, messages[code] ?? messages.SERVER!); }
export function careLinkErrorMessage(error: unknown) { return error instanceof CareLinkError ? error.message : messages.SERVER!; }
function uuid(value: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())) fail('INPUT');
  return value.trim().toLowerCase();
}
function check(error: unknown, target = false) {
  if (!error) return;
  const e = error as { status?: number; code?: string; name?: string };
  if (e.status === 401 || ['PGRST301', 'PGRST303', 'bad_jwt', 'session_not_found', 'refresh_token_not_found'].includes(e.code ?? '')) fail('AUTH');
  if (e.code === '23505') fail('DUPLICATE');
  if (e.code === '42501' || e.code === '23503' || e.status === 403) fail(target ? 'TARGET' : 'STALE');
  if (e.name === 'AbortError' || e.name === 'AuthRetryableFetchError' || e.name === 'TypeError' || e.status === 0) fail('NETWORK');
  fail('SERVER');
}
const fields = 'id,patient_id,guardian_id,requested_by,status,approved_by,approved_at,revoked_at,created_at';
function parseRow(value: unknown, actor: CareActor): CareLink {
  const v = value as CareLink | null;
  if (!v || !['pending', 'approved', 'revoked'].includes(v.status)) fail('RESPONSE');
  for (const id of [v.id, v.patient_id, v.guardian_id, v.requested_by]) { try { uuid(id); } catch { fail('RESPONSE'); } }
  if (v.patient_id === v.guardian_id || v.requested_by !== v.guardian_id
    || (actor.role === 'patient' ? v.patient_id : v.guardian_id) !== actor.id) fail('RESPONSE');
  for (const time of [v.approved_at, v.revoked_at, v.created_at]) if (time !== null && (typeof time !== 'string' || !Number.isFinite(Date.parse(time)))) fail('RESPONSE');
  if (!v.created_at || v.status === 'pending' && (v.approved_by !== null || v.approved_at !== null || v.revoked_at !== null)
    || v.status === 'approved' && (v.approved_by !== v.patient_id || !v.approved_at || v.revoked_at !== null)
    || v.status === 'revoked' && !v.revoked_at) fail('RESPONSE');
  return { id: v.id, patient_id: v.patient_id, guardian_id: v.guardian_id, requested_by: v.requested_by,
    status: v.status, approved_by: v.approved_by, approved_at: v.approved_at, revoked_at: v.revoked_at, created_at: v.created_at };
}
// JWT/RLS and the existing RPCs are authoritative. No profile lookup, admin key,
// direct care_links DML, medical-data query or role mutation is performed here.
export function createCareLinkRepository(client: SupabaseClient) {
  async function verified(actor: CareActor): Promise<CareActor> {
    const id = uuid(actor.id); if (!['patient', 'guardian'].includes(actor.role)) fail('ROLE');
    try {
      const { data, error } = await client.auth.getUser();
      if (error) {
        if (error.status === 401 || error.status === 403) fail('AUTH');
        check(error); fail('AUTH');
      }
      if (data.user?.id !== id) fail('AUTH');
    } catch (error) { if (error instanceof CareLinkError) throw error; check(error); }
    return { id, role: actor.role };
  }
  async function fresh(actor: CareActor, linkId: string) {
    const { data, error } = await client.from('care_links').select(fields).eq('id', uuid(linkId))
      .eq(actor.role === 'patient' ? 'patient_id' : 'guardian_id', actor.id).maybeSingle();
    check(error); if (!data) fail('STALE'); return parseRow(data, actor);
  }
  const repository = {
    async list(value: CareActor): Promise<CareLink[]> {
      const actor = await verified(value);
      const { data, error } = await client.from('care_links').select(fields)
        .eq(actor.role === 'patient' ? 'patient_id' : 'guardian_id', actor.id).order('created_at', { ascending: false }).limit(101);
      check(error); if (!Array.isArray(data)) fail('RESPONSE'); if (data.length > 100) fail('LIMIT');
      return data.map(row => parseRow(row, actor));
    },
    async request(value: CareActor, target: string): Promise<string> {
      if (value.role !== 'guardian') fail('ROLE');
      const patient = uuid(target); if (patient === uuid(value.id)) fail('SELF');
      const actor = await verified(value); if (actor.role !== 'guardian') fail('ROLE');
      const { data, error } = await client.rpc('request_care_link', { target_patient: patient }); check(error, true);
      try { return uuid(data); } catch { return fail('RESPONSE'); }
    },
    async decide(value: CareActor, linkId: string, action: 'approve' | 'reject' | 'revoke' | 'cancel'): Promise<void> {
      if (!['approve', 'reject', 'revoke', 'cancel'].includes(action)) fail('ROLE');
      if ((action === 'approve' || action === 'reject') && value.role !== 'patient' || action === 'cancel' && value.role !== 'guardian') fail('ROLE');
      const actor = await verified(value), row = await fresh(actor, linkId);
      if ((action === 'approve' || action === 'reject' || action === 'cancel') && row.status !== 'pending'
        || action === 'revoke' && row.status !== 'approved') fail('STALE');
      const { error } = await client.rpc(action === 'approve' ? 'approve_care_link' : 'revoke_care_link', { link_id: row.id }); check(error);
    },
  };
  async function guarded<T>(task: () => Promise<T>): Promise<T> {
    try { return await task(); } catch (e) { if (e instanceof CareLinkError) throw e; check(e); return fail('SERVER'); }
  }
  return {
    list: (actor: CareActor) => guarded(() => repository.list(actor)),
    request: (actor: CareActor, target: string) => guarded(() => repository.request(actor, target)),
    decide: (actor: CareActor, id: string, action: 'approve' | 'reject' | 'revoke' | 'cancel') => guarded(() => repository.decide(actor, id, action)),
  };
}
