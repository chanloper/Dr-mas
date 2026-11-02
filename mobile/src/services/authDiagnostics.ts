export type AuthStage = 'client_init' | 'signup' | 'login' | 'auth_user' | 'profile' | 'restore' | 'logout';
type AuthEvent = 'begin' | 'success' | 'error' | 'confirmation_required';
const descriptions: Record<string, string> = {
  invalid_credentials: '로그인 자격 증명이 거부됨',
  email_not_confirmed: '이메일 인증이 완료되지 않음',
  email_address_invalid: 'Auth에서 허용하지 않는 이메일 형식 또는 도메인',
  email_address_not_authorized: '이메일 발송 설정에서 수신자가 허용되지 않음',
  email_provider_disabled: '이메일 인증 제공자가 비활성화됨',
  signup_disabled: '신규 가입이 비활성화됨',
  user_already_exists: '이미 등록된 계정', email_exists: '이미 등록된 이메일',
  weak_password: '프로젝트 비밀번호 정책을 충족하지 못함',
  validation_failed: 'Auth 서버의 입력 검증 실패', bad_json: 'Auth 요청 본문 형식 오류',
  over_email_send_rate_limit: '인증 이메일 발송 제한',
  over_request_rate_limit: 'Auth 요청 횟수 제한',
  captcha_failed: 'CAPTCHA 검증 실패',
  unexpected_failure: 'Auth 서버 내부 오류; Auth 로그와 DB 트리거 점검 필요',
  request_timeout: 'Auth 요청 처리 시간 초과',
  bad_jwt: 'JWT 검증 실패', session_not_found: '세션을 찾지 못함',
  refresh_token_not_found: '갱신 세션을 찾지 못함', refresh_token_already_used: '폐기된 갱신 세션',
  PGRST205: 'Data API에서 프로필 테이블을 찾지 못함; 스키마 적용 여부 확인',
  PGRST116: '프로필 조회 결과가 단일 행이 아님; 누락 또는 RLS 확인',
  '42P01': '프로필 테이블 없음', '42501': '프로필 접근 권한 거부',
  CONFIG: '클라이언트 공개 설정 오류', STORAGE: '기기 세션 저장소 오류',
  PROFILE: '프로필 내용 또는 역할 검증 실패', PROFILE_SCHEMA: '프로필 스키마 누락',
  PROFILE_PERMISSION: '프로필 접근 권한 오류', UNAUTHORIZED: '인증 거부',
  ROLE_APPROVAL_REQUIRED: '서버 승인 역할이 필요함', RESPONSE: '유효한 세션 응답이 없음',
  NETWORK: '네트워크 또는 서버 세션 폐기 확인 실패',
};
const knownTypes = new Set(['Error', 'TypeError', 'AbortError', 'AuthError', 'AuthApiError', 'AuthRetryableFetchError', 'AuthUnknownError', 'AuthSessionMissingError', 'AuthWeakPasswordError', 'SessionStorageError', 'SupabaseConfigError']);

// Use closed vocabularies rather than redacting raw data after logging it.
// Unknown code/name values may themselves contain credentials and are discarded.
export function safeAuthDiagnostic(stage: AuthStage, event: AuthEvent, error?: unknown, status?: unknown) {
  const data = error && typeof error === 'object' ? error as { code?: unknown; status?: unknown; name?: unknown } : {};
  const code = typeof data.code === 'string' && Object.prototype.hasOwnProperty.call(descriptions, data.code) ? data.code : event === 'error' ? 'UNRECOGNIZED' : null;
  const type = typeof data.name === 'string' && knownTypes.has(data.name) ? data.name : event === 'error' ? 'UnknownError' : null;
  const rawStatus = status ?? data.status;
  const httpStatus = typeof rawStatus === 'number' && Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : null;
  const description = code && code !== 'UNRECOGNIZED' ? descriptions[code]
    : event === 'begin' ? '처리 시작' : event === 'success' ? '요청 처리 완료; 로그인 확정 여부는 후속 검증으로 결정'
      : event === 'confirmation_required' ? '이메일 확인 대기; 로그인 완료가 아님'
        : '허용 목록 밖의 오류; 원문은 기록하지 않음';
  return { stage, event, code, httpStatus, type, description };
}
export function logAuthDiagnostic(stage: AuthStage, event: AuthEvent, error?: unknown, status?: unknown): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  try { console.info('[DrMAS Auth]', JSON.stringify(safeAuthDiagnostic(stage, event, error, status))); }
  catch { /* Diagnostics must never change authentication behavior. */ }
}
