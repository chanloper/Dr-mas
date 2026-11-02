import { AppState } from 'react-native';
import { getSupabaseClient, clearStoredSupabaseSession, SupabaseConfigError } from './supabase';
import { SessionStorageError } from './secureSessionStorage';
import type { Role } from '../features/app/types';
import { logAuthDiagnostic, type AuthStage } from './authDiagnostics';

export type AuthUser = { id: string; email: string; name: string; role: Role };
export type LoginInput = { email: string; password: string };
export type RegisterInput = LoginInput & { name: string; requestedRole: Role };
export type AuthSession = { accessToken: string };
export type RegistrationResult = AuthSession | { requiresEmailConfirmation: true };
export class AuthError extends Error {
  constructor(public code: string, message: string, public status?: number) { super(message); }
}
function failure(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  if (error instanceof SupabaseConfigError) return new AuthError('CONFIG', error.message);
  if (error instanceof SessionStorageError) return new AuthError('STORAGE', '저장된 로그인 정보를 처리하지 못했습니다. 로그인 정보를 삭제한 후 다시 시도해 주세요.');
  const value = error && typeof error === 'object' ? error as { code?: string; status?: number; name?: string } : {};
  if (value.code === 'user_already_exists' || value.code === 'email_exists') return new AuthError('EMAIL_EXISTS', '이미 가입된 이메일입니다.', 409);
  if (value.code === 'email_not_confirmed') return new AuthError('EMAIL_NOT_CONFIRMED', '이메일 인증 후 로그인해 주세요.');
  if (value.code === 'email_address_invalid') return new AuthError('EMAIL_INVALID', '인증 서비스에서 허용하는 이메일 주소를 입력해 주세요.');
  if (value.code === 'email_address_not_authorized') return new AuthError('EMAIL_DELIVERY', '이메일 발송 설정에서 이 주소를 허용하지 않습니다. 관리자에게 문의해 주세요.');
  if (value.code === 'email_provider_disabled' || value.code === 'signup_disabled') return new AuthError('SIGNUP_DISABLED', '이메일 회원가입이 비활성화되어 있습니다. 관리자에게 문의해 주세요.');
  if (value.code === 'weak_password') return new AuthError('PASSWORD_POLICY', '프로젝트의 비밀번호 보안 정책을 충족하지 못했습니다.');
  if (value.code === 'validation_failed' || value.code === 'bad_json') return new AuthError('INVALID_INPUT', '인증 서버의 입력 검증을 통과하지 못했습니다. 입력 정보를 확인해 주세요.');
  if (value.code === 'captcha_failed') return new AuthError('CAPTCHA_REQUIRED', '가입 보안 검증이 필요합니다. 관리자에게 문의해 주세요.');
  if (['invalid_credentials', 'refresh_token_not_found', 'refresh_token_already_used', 'bad_jwt', 'session_not_found'].includes(value.code || '') || value.status === 401 || value.status === 403) return new AuthError('UNAUTHORIZED', '인증에 실패했습니다. 다시 로그인해 주세요.', value.status);
  if (value.status === 429 || value.code === 'over_email_send_rate_limit' || value.code === 'over_request_rate_limit') return new AuthError('RATE_LIMITED', '요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429);
  if (value.status && value.status >= 500) return new AuthError('SERVER', '인증 서버에서 요청을 처리하지 못했습니다. 관리자에게 문의해 주세요.', value.status);
  if (value.name === 'AuthRetryableFetchError' || value.name === 'AbortError') return new AuthError('NETWORK', '인증 서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.');
  return new AuthError('AUTH', '인증 처리에 실패했습니다. 입력 정보와 연결 상태를 확인해 주세요.');
}
export function authErrorMessage(error: unknown) { return failure(error).message; }
async function guarded<T>(stage: AuthStage, task: () => Promise<T>): Promise<T> {
  logAuthDiagnostic(stage, 'begin');
  try { const result = await task(); logAuthDiagnostic(stage, 'success'); return result; }
  catch (error) { logAuthDiagnostic(stage, 'error', error); throw failure(error); }
}
export async function register(input: RegisterInput): Promise<RegistrationResult> {
  return guarded('signup', async () => {
    if (input.requestedRole !== 'patient') throw new AuthError('ROLE_APPROVAL_REQUIRED', '보호자 계정은 별도 승인 절차가 필요합니다.', 403);
    const { data, error } = await getSupabaseClient().auth.signUp({ email: input.email.trim(), password: input.password, options: { data: { display_name: input.name.trim() } } });
    if (error) throw error;
    // Confirmation-enabled projects (including obfuscated duplicate signup
    // responses) must not be presented as an authenticated account.
    if (!data.session) { logAuthDiagnostic('signup', 'confirmation_required'); return { requiresEmailConfirmation: true }; }
    return { accessToken: data.session.access_token };
  });
}
export async function login(input: LoginInput): Promise<AuthSession> {
  return guarded('login', async () => {
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email: input.email.trim(), password: input.password });
    if (error) throw error;
    if (!data.session?.access_token) throw new AuthError('RESPONSE', '로그인 세션을 확인할 수 없습니다.');
    return { accessToken: data.session.access_token };
  });
}
export async function getCurrentUser(token?: string): Promise<AuthUser> {
  return guarded('auth_user', async () => {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error) throw error;
    if (!data.user?.id || !data.user.email) throw new AuthError('UNAUTHORIZED', '계정 정보를 확인할 수 없습니다.');
    logAuthDiagnostic('profile', 'begin');
    let profile;
    try { profile = await supabase.from('profiles').select('id,display_name,role').eq('id', data.user.id).single(); }
    catch (error) { logAuthDiagnostic('profile', 'error', error); throw new AuthError('PROFILE', '사용자 프로필을 불러오지 못했습니다. 연결 상태를 확인해 주세요.'); }
    if (profile.error) {
      logAuthDiagnostic('profile', 'error', profile.error, profile.status);
      if (profile.error.code === 'PGRST205' || profile.error.code === '42P01') throw new AuthError('PROFILE_SCHEMA', '계정의 서비스 이용 정보가 아직 준비되지 않았습니다. 관리자 확인 후 다시 로그인해 주세요.');
      if (profile.error.code === '42501') throw new AuthError('PROFILE_PERMISSION', '계정의 서비스 이용 권한을 확인하지 못했습니다. 관리자에게 문의해 주세요.');
    }
    if (profile.error || !profile.data || profile.data.id !== data.user.id || typeof profile.data.display_name !== 'string' || !['patient', 'guardian'].includes(profile.data.role)) {
      throw new AuthError('PROFILE', '사용자 프로필을 확인할 수 없습니다. 관리자에게 문의해 주세요.');
    }
    logAuthDiagnostic('profile', 'success');
    // user_metadata and the role selected on the device never grant authority.
    return { id: data.user.id, email: data.user.email, name: profile.data.display_name, role: profile.data.role as Role };
  });
}
export async function readToken(): Promise<string | null> {
  return guarded('restore', async () => {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) throw error;
    return data.session?.access_token ?? null;
  });
}
// Compatibility with the existing controller: the SDK has already persisted
// the full session (including refresh token) through secureSessionStorage.
export async function saveToken(token: string): Promise<void> {
  if (!token || await readToken() !== token) throw new AuthError('STORAGE', '로그인 정보를 안전하게 저장하지 못했습니다.');
}
export async function clearToken(): Promise<void> {
  return guarded('logout', async () => {
    const supabase = getSupabaseClient();
    let error: unknown;
    try { ({ error } = await supabase.auth.signOut({ scope: 'local' })); }
    catch (cause) { error = cause; }
    if (error) {
      logAuthDiagnostic('logout', 'error', error);
      await supabase.auth.stopAutoRefresh().catch(() => undefined);
      try { await clearStoredSupabaseSession(); }
      catch { throw new AuthError('STORAGE', '저장된 로그인 정보를 삭제하지 못했습니다. 다시 시도해 주세요.'); }
      throw new AuthError('NETWORK', '이 기기의 로그인 정보는 삭제했지만 서버의 세션 폐기를 확인하지 못했습니다.');
    }
  });
}
export function watchSession(onSignedOut: () => void): () => void {
  const supabase = getSupabaseClient();
  const { data } = supabase.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') onSignedOut(); });
  const refresh = (state: string) => {
    const task = state === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh();
    void task.catch(() => undefined);
  };
  refresh(AppState.currentState ?? 'unknown');
  const listener = AppState.addEventListener('change', refresh);
  return () => { listener.remove(); data.subscription.unsubscribe(); void supabase.auth.stopAutoRefresh(); };
}
