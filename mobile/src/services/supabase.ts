import 'react-native-url-polyfill/auto';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { secureSessionStorage } from './secureSessionStorage';
import { logAuthDiagnostic } from './authDiagnostics';

export class SupabaseConfigError extends Error {}
let client: SupabaseClient | undefined;
let sessionKey: string | undefined;
let clientOrigin: string | undefined;

// Boolean-only check for development diagnostics; never exposes configuration.
export function matchesSupabaseProject(expectedRef: string): boolean {
  return !!client && /^[a-z0-9-]+$/.test(expectedRef) && clientOrigin === `https://${expectedRef}.supabase.co`;
}

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;
  logAuthDiagnostic('client_init', 'begin');
  const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const envKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const publicConfig: unknown = Constants.expoConfig?.extra?.supabase;
  const manifest = publicConfig && typeof publicConfig === 'object' ? publicConfig as Record<string, unknown> : {};
  // Use a complete pair from one source; never mix two projects' configuration.
  // The Expo Go manifest also carries this allowlisted pair when the runtime
  // environment module has not received EXPO_PUBLIC_* values.
  const useEnv = Boolean(envUrl && envKey);
  const url = useEnv ? envUrl : typeof manifest.url === 'string' ? manifest.url.trim() : undefined;
  const key = useEnv ? envKey : typeof manifest.publishableKey === 'string' ? manifest.publishableKey.trim() : undefined;
  if (!url || !key) throw new SupabaseConfigError('Supabase 연결 설정이 없습니다. 프로젝트 URL과 공개 키를 설정해 주세요.');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new SupabaseConfigError('Supabase 프로젝트 URL 설정을 확인해 주세요.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new SupabaseConfigError('Supabase 프로젝트에는 올바른 HTTPS URL이 필요합니다.');
  }
  const environment = Constants.expoConfig?.extra?.environment;
  const appEnv = process.env.EXPO_PUBLIC_APP_ENV?.trim() || environment?.name;
  const expectedRef = process.env.EXPO_PUBLIC_EXPECTED_SUPABASE_REF?.trim() || environment?.expectedSupabaseRef;
  if (appEnv && !['development', 'production'].includes(appEnv) || appEnv && !expectedRef
    || expectedRef && (!/^[a-z0-9-]+$/.test(expectedRef) || parsed.hostname !== `${expectedRef}.supabase.co`)) {
    throw new SupabaseConfigError('선택한 환경과 Supabase 프로젝트 설정이 일치하지 않습니다. 연결 설정을 확인해 주세요.');
  }
  // Only new publishable keys are accepted. Never accept secret/service_role keys.
  if (!key.startsWith('sb_publishable_')) throw new SupabaseConfigError('앱에는 Supabase publishable 공개 키만 설정할 수 있습니다.');
  sessionKey = `drmas.supabase.${parsed.hostname.replace(/[^a-zA-Z0-9._-]/g, '_')}.v1`;
  client = createClient(parsed.origin, key, {
    auth: { storage: secureSessionStorage, storageKey: sessionKey, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, lock: processLock, flowType: 'pkce' },
    global: {
      fetch: async (input, init) => {
        const controller = new AbortController();
        const abort = () => controller.abort();
        const signal = init?.signal;
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(abort, 15000);
        try { return await fetch(input, { ...init, signal: controller.signal }); }
        finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
      },
    },
  });
  logAuthDiagnostic('client_init', 'success');
  clientOrigin = parsed.origin;
  return client;
}

export async function clearStoredSupabaseSession() {
  if (sessionKey) await secureSessionStorage.removeItem(sessionKey);
}
