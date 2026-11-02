import * as SecureStore from 'expo-secure-store';
import type { Role } from '../features/app/types';

export type AuthUser = { id: string; email: string; name: string; role: Role };
export type LoginInput = { email: string; password: string };
export type RegisterInput = LoginInput & { name: string; requestedRole: Role };
export type AuthSession = { accessToken: string };
export class AuthError extends Error {
  constructor(public code: string, message: string, public status?: number) { super(message); }
}
export function authErrorMessage(error: unknown): string {
  return error instanceof AuthError ? error.message : '인증 처리 중 오류가 발생했습니다. 다시 시도해 주세요.';
}

async function request(path: string, method: string, body?: unknown, token?: string): Promise<unknown> {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new AuthError('CONFIG', '인증 서버 주소가 설정되지 않았습니다.');
  let url: URL;
  try { url = new URL(base); } catch { throw new AuthError('CONFIG', '인증 서버 주소 설정을 확인해 주세요.'); }
  if (url.protocol !== 'https:' && !(__DEV__ && url.protocol === 'http:')) {
    throw new AuthError('CONFIG', '인증 서버에는 HTTPS 연결이 필요합니다.');
  }
  if (url.username || url.password || url.search || url.hash) throw new AuthError('CONFIG', '인증 서버 주소 설정을 확인해 주세요.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${base}${path}`, {
      method, signal: controller.signal,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      if (response.status === 409) throw new AuthError('EMAIL_EXISTS', '이미 가입된 이메일입니다.', 409);
      if (response.status === 403 && path === '/auth/register') {
        const errorBody: unknown = await response.json().catch(() => null);
        if (errorBody && typeof errorBody === 'object' && 'code' in errorBody && errorBody.code === 'ROLE_APPROVAL_REQUIRED') {
          throw new AuthError('ROLE_APPROVAL_REQUIRED', '보호자 계정은 별도 승인 절차가 필요합니다.', 403);
        }
      }
      if (response.status === 401 || response.status === 403) throw new AuthError('UNAUTHORIZED', '인증에 실패했습니다. 계정 정보를 확인하고 다시 로그인해 주세요.', response.status);
      throw new AuthError('SERVER', response.status >= 500 ? '인증 서버에 문제가 있습니다. 잠시 후 다시 시도해 주세요.' : '요청을 처리할 수 없습니다. 입력 정보를 확인해 주세요.', response.status);
    }
    try { return await response.json(); } catch { throw new AuthError('RESPONSE', '인증 서버 응답 형식이 올바르지 않습니다.'); }
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError('NETWORK', '인증 서버에 연결할 수 없습니다. 네트워크를 확인하고 다시 시도해 주세요.');
  } finally { clearTimeout(timer); }
}
function session(data: unknown): AuthSession {
  if (!data || typeof data !== 'object' || !('accessToken' in data) || typeof data.accessToken !== 'string' || !data.accessToken.trim()) {
    throw new AuthError('RESPONSE', '인증 서버가 유효한 토큰을 반환하지 않았습니다.');
  }
  return { accessToken: data.accessToken };
}
export async function register(input: RegisterInput): Promise<AuthSession> { return session(await request('/auth/register', 'POST', input)); }
export async function login(input: LoginInput): Promise<AuthSession> { return session(await request('/auth/login', 'POST', input)); }
export async function getCurrentUser(token: string): Promise<AuthUser> {
  const data = await request('/auth/me', 'GET', undefined, token);
  if (!data || typeof data !== 'object') throw new AuthError('RESPONSE', '계정 정보를 확인할 수 없습니다.');
  const user = data as Record<string, unknown>;
  if (typeof user.id !== 'string' || !user.id || typeof user.email !== 'string' || typeof user.name !== 'string' || (user.role !== 'patient' && user.role !== 'guardian')) {
    throw new AuthError('RESPONSE', '계정 정보 또는 역할이 올바르지 않습니다.');
  }
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
const TOKEN_KEY = 'drmas.auth.accessToken.v1';
async function storageAvailable() {
  if (!await SecureStore.isAvailableAsync()) throw new AuthError('STORAGE', '이 환경에서는 안전한 로그인 정보 저장을 지원하지 않습니다. 모바일 앱에서 이용해 주세요.');
}
export async function readToken() {
  await storageAvailable();
  try { return await SecureStore.getItemAsync(TOKEN_KEY); }
  catch { throw new AuthError('STORAGE', '저장된 로그인 정보를 읽지 못했습니다. 다시 로그인해 주세요.'); }
}
export async function saveToken(token: string) {
  await storageAvailable();
  try { await SecureStore.setItemAsync(TOKEN_KEY, token); }
  catch { throw new AuthError('STORAGE', '로그인 정보를 안전하게 저장하지 못했습니다. 다시 시도해 주세요.'); }
}
export async function clearToken() {
  await storageAvailable();
  try { await SecureStore.deleteItemAsync(TOKEN_KEY); }
  catch { throw new AuthError('STORAGE', '저장된 로그인 정보를 삭제하지 못했습니다.'); }
}
