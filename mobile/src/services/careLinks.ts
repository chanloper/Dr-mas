import type { SupabaseClient } from '@supabase/supabase-js';
export type CareActor = { id: string; role: 'patient' | 'guardian' };
export type CareLink = {
  id: string; patient_id: string; guardian_id: string; requested_by: string;
  status: 'pending' | 'approved' | 'revoked'; approved_by: string | null;
  approved_at: string | null; revoked_at: string | null; created_at: string;
  closure_reason?: 'rejected' | 'cancelled' | 'revoked' | null;
  display_name?: string | null;
};
export type CareCursor = { createdAt: string; id: string };
export type CarePage = { rows: CareLink[]; next: CareCursor | null; supportsReconnect: boolean };
export const CARE_PAGE_SIZE = 25;
export function careLinkStatus(link: CareLink) {
  if (link.status === 'pending') return '승인 대기';
  if (link.status === 'approved') return '승인됨';
  return link.closure_reason === 'rejected' ? '거절됨' : link.closure_reason === 'cancelled' ? '요청 취소됨'
    : link.closure_reason === 'revoked' ? '해제됨' : '종료됨 · 사유 미상';
}
export class CareLinkError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const messages: Record<string, string> = {
  INPUT: '올바른 환자 계정 ID를 입력해 주세요.', SELF: '자신에게 연결을 요청할 수 없습니다.',
  ROLE: '현재 계정 역할로는 이 작업을 할 수 없습니다.', AUTH: '로그인이 만료됐거나 계정이 변경됐습니다. 다시 로그인해 주세요.',
  DUPLICATE: '이미 대기 중인 요청이나 승인된 연결이 있거나 서버에서 중복으로 처리했습니다. 목록을 새로고침해 주세요.',
  UNSUPPORTED: '현재 서버에서는 종료된 연결의 재요청을 지원하지 않습니다. 기존 연결은 그대로 유지됩니다.',
  BUSY: '연결 요청을 처리 중입니다. 잠시 기다려 주세요.',
  TARGET: '연결을 요청할 수 없습니다. 환자 ID와 계정 역할, 연결 권한을 확인해 주세요.',
  STALE: '요청 상태가 바뀌었거나 처리 권한이 없습니다. 목록을 새로고침해 주세요.',
  NETWORK: '연결 상태를 확인하지 못했습니다. 요청을 반복하지 말고 목록을 새로고침해 주세요.',
  SERVER: '서버에서 연결 요청을 처리하지 못했습니다. 목록을 새로고침해 주세요.',
  RESPONSE: '서버의 연결 정보를 확인하지 못했습니다. 목록을 새로고침해 주세요.',
  LIMIT: '한 번에 확인할 수 있는 내역 수에 도달했습니다. 목록을 새로고침해 주세요.',
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
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
function timeKey(value: string) {
  const fraction = value.match(/\.(\d{1,6})/)?.[1] ?? '';
  return BigInt(Date.parse(value)) * 1000n + BigInt(fraction.padEnd(6, '0').slice(3));
}
function older(row: CareLink, cursor: CareCursor) {
  const a = timeKey(row.created_at), b = timeKey(cursor.createdAt);
  return a < b || a === b && row.id < cursor.id;
}
function parseRow(value: unknown, actor: CareActor, extended = false): CareLink {
  const v = value as CareLink | null;
  if (!v || !['pending', 'approved', 'revoked'].includes(v.status)) fail('RESPONSE');
  for (const id of [v.id, v.patient_id, v.guardian_id, v.requested_by]) { try { uuid(id); } catch { fail('RESPONSE'); } }
  if (v.patient_id === v.guardian_id || v.requested_by !== v.guardian_id
    || (actor.role === 'patient' ? v.patient_id : v.guardian_id) !== actor.id) fail('RESPONSE');
  for (const time of [v.approved_at, v.revoked_at, v.created_at]) if (time !== null && (typeof time !== 'string' || !Number.isFinite(Date.parse(time)))) fail('RESPONSE');
  if (!v.created_at || v.status === 'pending' && (v.approved_by !== null || v.approved_at !== null || v.revoked_at !== null)
    || v.status === 'approved' && (v.approved_by !== v.patient_id || !v.approved_at || v.revoked_at !== null)
    || v.status === 'revoked' && !v.revoked_at) fail('RESPONSE');
  if (!timestamp.test(v.created_at) || (v.approved_by === null) !== (v.approved_at === null)
    || v.approved_by !== null && v.approved_by !== v.patient_id) fail('RESPONSE');
  if (extended && !(v.closure_reason === null || ['rejected', 'cancelled', 'revoked'].includes(v.closure_reason ?? ''))) fail('RESPONSE');
  if (extended && v.status !== 'revoked' && v.closure_reason !== null) fail('RESPONSE');
  return { id: v.id, patient_id: v.patient_id, guardian_id: v.guardian_id, requested_by: v.requested_by,
    status: v.status, approved_by: v.approved_by, approved_at: v.approved_at, revoked_at: v.revoked_at, created_at: v.created_at,
    ...(extended ? { closure_reason: v.closure_reason } : {}) };
}
// JWT/RLS and the existing RPCs are authoritative. No profile lookup, admin key,
// direct care_links DML, medical-data query or role mutation is performed here.
export function createCareLinkRepository(client: SupabaseClient) {
  let mutationBusy = false;
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
  function missingColumn(error: unknown) {
    const e = error as { code?: string; status?: number } | null;
    return e?.status !== 401 && e?.status !== 403 && ['42703', 'PGRST204'].includes(e?.code ?? '');
  }
  async function supportsReconnect(actor: CareActor) {
    // Read-only schema signal for the known atomic reconnect migration. No RPC probe/write.
    const { data, error } = await client.from('care_links').select('closure_reason')
      .eq(actor.role === 'patient' ? 'patient_id' : 'guardian_id', actor.id).limit(0);
    if (missingColumn(error)) return false;
    check(error); if (!Array.isArray(data) || data.length !== 0) fail('RESPONSE'); return true;
  }
  async function page(value: CareActor, cursor: CareCursor | null = null): Promise<CarePage> {
    const actor = await verified(value);
    if (cursor && (!timestamp.test(cursor.createdAt) || !Number.isFinite(Date.parse(cursor.createdAt)))) fail('INPUT');
    const cursorId = cursor ? uuid(cursor.id) : null;
    async function read(extended: boolean) {
      let query = client.from('care_links').select(fields + (extended ? ',closure_reason' : ''), { count: 'exact' })
        .eq(actor.role === 'patient' ? 'patient_id' : 'guardian_id', actor.id)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(CARE_PAGE_SIZE + 1);
      if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursorId})`);
      return await query;
    }
    let extended = true, response = await read(true);
    if (missingColumn(response.error)) { extended = false; response = await read(false); }
    check(response.error);
    if (!Array.isArray(response.data) || response.data.length > CARE_PAGE_SIZE + 1) fail('RESPONSE');
    const parsed = response.data.map(row => parseRow(row, actor, extended));
    if (new Set(parsed.map(row => row.id)).size !== parsed.length) fail('RESPONSE');
    if (response.count === null || !Number.isInteger(response.count) || response.count < parsed.length
      || response.count > parsed.length && parsed.length < CARE_PAGE_SIZE + 1) fail('RESPONSE');
    for (let i = 0; i < parsed.length; i++) {
      const previous = parsed[i - 1];
      if (cursor && !older(parsed[i]!, cursor)
        || previous && !older(parsed[i]!, { createdAt: previous.created_at, id: previous.id })) fail('RESPONSE');
    }
    const rows = parsed.slice(0, CARE_PAGE_SIZE), last = rows.at(-1);
    return { rows, next: parsed.length > CARE_PAGE_SIZE && last ? { createdAt: last.created_at, id: last.id } : null, supportsReconnect: extended };
  }
  const repository = {
    async list(value: CareActor): Promise<CareLink[]> {
      return (await page(value)).rows;
    },
    async request(value: CareActor, target: string): Promise<string> {
      if (value.role !== 'guardian') fail('ROLE');
      const patient = uuid(target); if (patient === uuid(value.id)) fail('SELF');
      const actor = await verified(value); if (actor.role !== 'guardian') fail('ROLE');
      // Pair-specific reads cover active rows even when they are on an unloaded page.
      const active = await client.from('care_links').select(fields).eq('guardian_id', actor.id)
        .eq('patient_id', patient).in('status', ['pending', 'approved']).limit(1);
      check(active.error); if (!Array.isArray(active.data)) fail('RESPONSE');
      if (active.data.length) { parseRow(active.data[0], actor); fail('DUPLICATE'); }
      const history = await client.from('care_links').select(fields).eq('guardian_id', actor.id)
        .eq('patient_id', patient).eq('status', 'revoked').limit(1);
      check(history.error); if (!Array.isArray(history.data)) fail('RESPONSE');
      if (history.data.length) {
        parseRow(history.data[0], actor);
        if (!await supportsReconnect(actor)) fail('UNSUPPORTED');
      }
      await verified(actor);
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
  async function mutate<T>(task: () => Promise<T>): Promise<T> {
    if (mutationBusy) fail('BUSY'); mutationBusy = true;
    try { return await guarded(task); } finally { mutationBusy = false; }
  }
  return {
    list: (actor: CareActor) => guarded(() => repository.list(actor)),
    page: (actor: CareActor, cursor: CareCursor | null = null) => guarded(() => page(actor, cursor)),
    request: (actor: CareActor, target: string) => mutate(() => repository.request(actor, target)),
    decide: (actor: CareActor, id: string, action: 'approve' | 'reject' | 'revoke' | 'cancel') => mutate(() => repository.decide(actor, id, action)),
  };
}
