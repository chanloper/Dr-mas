import { getSupabaseClient } from './supabase';
import { validateDurDrugs, validateDurResult, validateDurSearch, validateDurSearchResult, type DurDrug } from './durContract';

const messages: Record<string, string> = {
  AUTH_REQUIRED: '로그인을 확인하지 못했습니다. 다시 로그인해 주세요.',
  NOT_CONFIGURED: 'DUR 조회 서버 설정이 아직 준비되지 않았습니다.',
  RATE_LIMITED: '조회 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
  LIMITER_UNAVAILABLE: '조회 보호 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  PROVIDER_REJECTED: '식약처 API에서 조회를 처리하지 못했습니다. 서버 인증·이용 승인을 확인해야 합니다.',
  INVALID_INPUT: '약품명과 품목코드를 확인해 주세요.',
  TIMEOUT: '조회가 취소되었거나 제한 시간을 초과했습니다.',
  ORIGIN_DENIED: '현재 웹 주소에서는 DUR 조회를 이용할 수 없습니다.',
};
export class DurError extends Error {
  constructor(public code: string) { super(messages[code] ?? '병용금기 정보를 조회하지 못했습니다. 연결·로그인·서버 설정을 확인해 주세요.'); }
}

// Explicit opt-in after deployment verification; no automatic probe or image upload.
export function durConfigured(): boolean { return process.env.EXPO_PUBLIC_DUR_ENABLED === '1'; }
async function invokeDur(body: object, signal: AbortSignal): Promise<unknown> {
  if (!durConfigured()) throw Error('병용금기 조회 서버가 아직 연결되지 않았습니다.');
  const client = getSupabaseClient();
  const controller = new AbortController(); const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
  const timer = setTimeout(abort, 25000);
  try {
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user || auth.user.is_anonymous) throw new DurError('AUTH_REQUIRED');
    if (controller.signal.aborted) throw Error();
    const { data: session } = await client.auth.getSession();
    if (!session.session || session.session.user.id !== auth.user.id) throw new DurError('AUTH_REQUIRED');
    const { data, error } = await client.functions.invoke('check-dur', {
      body, headers: { Authorization: `Bearer ${session.session.access_token}` }, signal: controller.signal,
    });
    if (error) {
      let code = 'UNAVAILABLE';
      const response = error.context;
      if (response?.status === 401) code = 'AUTH_REQUIRED';
      else if (response?.status === 429) code = 'RATE_LIMITED';
      else if (response?.status === 404) code = 'NOT_CONFIGURED';
      else if (response && Number(response.headers?.get('content-length')) <= 4096) {
        try { const failure = await response.clone().json(); if (typeof failure?.code === 'string' && Object.hasOwn(messages, failure.code)) code = failure.code; } catch { /* Never display provider/SDK error text. */ }
      }
      throw new DurError(code);
    }
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw new DurError('TIMEOUT');
    // Only fixed local errors may be presented. No upstream bodies or SDK errors.
    if (error instanceof DurError) throw error;
    throw Error('병용금기 응답을 확인하지 못했습니다. 안전 여부를 판단할 수 없습니다.');
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}
export async function searchPrescriptionDrugs(query: string, page: number, signal: AbortSignal) {
  let input;
  try { input = validateDurSearch({ mode: 'search', query: query.trim(), page }); } catch { throw new DurError('INVALID_INPUT'); }
  const data = await invokeDur(input, signal);
  let result;
  try { result = validateDurSearchResult(data); } catch { throw new DurError('UNAVAILABLE'); }
  if (result.query !== input.query || result.page !== input.page) throw new DurError('UNAVAILABLE');
  return result;
}
export async function checkPrescriptionDur(drugs: DurDrug[], signal: AbortSignal) {
  let input;
  try { input = validateDurDrugs(drugs); } catch { throw new DurError('INVALID_INPUT'); }
  const data = await invokeDur({ drugs: input }, signal);
  let result;
  try { result = validateDurResult(data); } catch { throw new DurError('UNAVAILABLE'); }
  if (result.drugs.length !== input.length || result.drugs.some((d, i) => d.name !== input[i]!.name || d.itemSeq !== (input[i]!.itemSeq ?? null))) throw new DurError('UNAVAILABLE');
  return result;
}
