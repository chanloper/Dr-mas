import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthUser } from './auth';

export class AccountError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const messages: Record<string, string> = {
  AUTH: '로그인이 만료됐거나 계정이 변경됐습니다. 다시 로그인 상태를 확인해 주세요.',
  INPUT: '이름은 공백을 제외하고 1~100자로 입력해 주세요.',
  PASSWORD: '새 비밀번호를 8~128자로 입력하고 확인란을 동일하게 입력해 주세요.',
  CODE: '받은 확인 코드를 입력해 주세요.',
  FORBIDDEN: '현재 계정에는 이 작업을 수행할 권한이 없습니다. 관리자에게 문의해 주세요.',
  REAUTH_REQUIRED: '비밀번호 변경에 재인증이 필요합니다. 확인 코드를 요청한 뒤 다시 시도해 주세요.',
  CODE_INVALID: '확인 코드가 올바르지 않거나 만료됐습니다. 새 코드를 요청해 주세요.',
  POLICY: '새 비밀번호가 서버 보안 정책을 충족하지 못했습니다. 다른 비밀번호를 입력해 주세요.',
  SAME_PASSWORD: '기존 비밀번호와 다른 새 비밀번호를 입력해 주세요.',
  CREDENTIALS: '현재 비밀번호를 확인해 주세요. 인증이 만료됐다면 다시 로그인해 주세요.',
  RATE_LIMIT: '요청이 많습니다. 잠시 기다린 뒤 다시 시도해 주세요.',
  DELIVERY: '확인 코드를 보내지 못했습니다. 인증 연락처와 서버 메일 발송 설정을 확인해 주세요.',
  BUSY: '이미 요청을 처리 중입니다. 처리 결과를 기다려 주세요.',
  RESPONSE: '처리 결과를 확인하지 못했습니다. 프로필을 다시 불러오거나 로그인 상태를 확인해 주세요.',
  SERVER: '서버 처리 결과를 확인하지 못했습니다. 요청을 반복하지 말고 현재 정보를 다시 확인해 주세요.',
};
function fail(code: string): never { throw new AccountError(code, messages[code] ?? messages.SERVER!); }
export function accountErrorMessage(error: unknown): string { return error instanceof AccountError ? error.message : messages.SERVER!; }
function check(error: unknown) {
  if (!error) return;
  const e = error as { code?: string; status?: number };
  if (['reauthentication_needed', 'reauth_nonce_missing'].includes(e.code ?? '')) fail('REAUTH_REQUIRED');
  if (['reauthentication_not_valid', 'otp_expired'].includes(e.code ?? '')) fail('CODE_INVALID');
  if (e.code === 'weak_password') fail('POLICY');
  if (e.code === 'same_password') fail('SAME_PASSWORD');
  if (e.code === 'invalid_credentials' || e.code === 'current_password_required') fail('CREDENTIALS');
  if (e.status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit', 'over_sms_send_rate_limit'].includes(e.code ?? '')) fail('RATE_LIMIT');
  if (['email_address_not_authorized', 'email_provider_disabled', 'sms_send_failed', 'email_not_confirmed', 'phone_not_confirmed'].includes(e.code ?? '')) fail('DELIVERY');
  if (e.code === '42501' || e.status === 403) fail('FORBIDDEN');
  if (e.status === 401 || ['bad_jwt', 'session_not_found', 'refresh_token_not_found'].includes(e.code ?? '')) fail('AUTH');
  fail('SERVER');
}
function profile(value: unknown, id: string, email: string): AuthUser {
  const row = value as { id?: unknown; display_name?: unknown; role?: unknown } | null;
  if (!row || row.id !== id || typeof row.display_name !== 'string' || !row.display_name.trim() || Array.from(row.display_name).length > 100 || !['patient', 'guardian'].includes(String(row.role))) fail('RESPONSE');
  return { id, email, name: row.display_name, role: row.role as AuthUser['role'] };
}
export function createAccountRepository(client: SupabaseClient) {
  let busy = false;
  async function run<T>(task: () => Promise<T>): Promise<T> {
    if (busy) fail('BUSY'); busy = true;
    try { return await task(); }
    catch (error) { if (error instanceof AccountError) throw error; fail('SERVER'); }
    finally { busy = false; }
  }
  async function actor(expected: string) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(expected)) fail('AUTH');
    const { data, error } = await client.auth.getUser();
    if (error || data.user?.id !== expected || !data.user.email) fail('AUTH');
    return data.user;
  }
  return {
    read: (expected: string) => run(async () => {
      const user = await actor(expected);
      const { data, error } = await client.from('profiles').select('id,display_name,role').eq('id', user.id).single();
      check(error); return profile(data, user.id, user.email!);
    }),
    updateName: (expected: string, value: string) => run(async () => {
      if (typeof value !== 'string' || !value.trim() || Array.from(value.trim()).length > 100) fail('INPUT');
      const user = await actor(expected);
      // Fixed payload, verified owner filter and existing RLS; no role, email,
      // user_metadata, upsert or other user's profile can be supplied by callers.
      const { data, error } = await client.from('profiles').update({ display_name: value.trim() }).eq('id', user.id).select('id,display_name,role').single();
      check(error); return profile(data, user.id, user.email!);
    }),
    requestCode: (expected: string) => run(async () => {
      await actor(expected);
      const { error } = await client.auth.reauthenticate(); check(error);
    }),
    changePassword: (expected: string, input: { password: string; confirmation: string; currentPassword?: string; nonce?: string }) => run(async () => {
      if (typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 128 || input.password !== input.confirmation) fail('PASSWORD');
      if (input.currentPassword !== undefined && (typeof input.currentPassword !== 'string' || input.currentPassword.length > 128)) fail('PASSWORD');
      const nonce = input.nonce?.trim();
      if (nonce && !/^[a-zA-Z0-9]{6,64}$/.test(nonce)) fail('CODE');
      await actor(expected);
      const { data, error } = await client.auth.updateUser({ password: input.password,
        ...(input.currentPassword ? { current_password: input.currentPassword } : {}), ...(nonce ? { nonce } : {}) });
      check(error); if (data.user?.id !== expected) fail('RESPONSE');
    }),
  };
}
