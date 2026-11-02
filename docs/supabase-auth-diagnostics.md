# Supabase 회원가입 실패의 안전한 진단

검증일: 2026-11-01 (Asia/Seoul), DrMAS-Mobile

## 코드 경로

AuthScreen의 가입 버튼 → 컨트롤러 submitAuth → services/auth.register →
getSupabaseClient → supabase.auth.signUp 순서다.

컨트롤러는 가입 시 이름·이메일 형식·빈 비밀번호·8자 미만·확인 비밀번호
불일치를 차단한다. 로그인은 이메일 형식·빈 비밀번호만 사전 검사한다.
비밀번호는 trim하지 않는다. 서버의 더 강한 비밀번호 정책, 도메인·SMTP·
CAPTCHA·발송 횟수 정책은 실제 Auth 응답으로 처리한다. 앱에서 이를 우회하지 않는다.
환자 가입만 허용하며 보호자 선택은 기존 승인 필요 안내를 유지한다.

가입의 SDK session이 없으면 이메일 확인 안내 후 로그인 화면에 남는다.
session이 있으면 getCurrentUser에서 Auth getUser를 확인하고 profiles를 읽는다.
프로필 역할 검증과 SDK 세션 저장 확인 후에만 홈으로 이동한다.

## 일반 오류의 의미와 수정

기존 guarded catch는 원본 오류를 failure로 바꾸면서, 매핑되지 않은 모든
코드에 같은 AUTH 문구를 반환했다. 원문 로그도 없어서 어떤 단계가 실패했는지
알 수 없었다. 해당 문구만으로 프로젝트 키·이메일 발송·Auth 서버·기기 저장소
중 하나를 확정할 수 없다.

개발 빌드에만 `[DrMAS Auth]` 진단을 추가했다. 출력 항목은 stage, event,
허용 목록의 code·type, 숫자 HTTP status와 고정된 설명뿐이다. 원본 객체,
message, stack, cause, 요청/응답 본문, 이메일, 비밀번호, 세션, 토큰, 키,
전체 URL을 출력하지 않는다. 알 수 없는 코드·이름도 그대로 출력하지 않고
UNRECOGNIZED/UnknownError로 치환한다. production에서는 출력하지 않는다.

이메일 주소/수신자 제한, 가입/제공자 비활성화, 비밀번호 정책, CAPTCHA,
횟수 제한, 서버 오류를 안전한 개별 UI 메시지로 매핑했다. 서버 오류 문자열은
화면에 복사하지 않는다. UI 레이아웃과 복약·AI·SOS 로직은 수정하지 않았다.

프로필 조회 오류는 변환 전에 별도 profile 단계로 기록한다. PGRST205/42P01은
PROFILE_SCHEMA, 42501은 PROFILE_PERMISSION으로 구분한다. 프로필 누락·역할
불일치는 홈 진입을 막는 기존 원칙을 유지한다.

## 현재 확인 범위

로컬 .env와 실제 Expo config에서 URL 존재·HTTPS origin 형식, 공개 키
존재·접두사 형식, 정적 변수 참조를 확인했다. 값은 출력하지 않았다.
이는 URL/키가 실제 같은 프로젝트에 속하거나 서버에서 유효하다는 보증이 아니다.
SDK 초기화 성공도 Auth 요청 성공을 의미하지 않는다.

실제 휴대폰의 실패 응답 코드는 아직 확보하지 않았다. 원격 가입 요청을
대신 보내지 않았고 Supabase 또는 Cloudtype SQL·DB를 변경하지 않았다.
따라서 이번에 확인한 문제는 오류 정보 손실이며, 원격 실패의 근본 원인을
확정하거나 해결했다고 주장하지 않는다.

마이그레이션을 전혀 적용하지 않았다면 본 프로젝트의 프로필 생성 트리거도
없다. 보통 Auth 가입과 profiles 조회는 별도 단계다. 단, 프로젝트에 다른
깨진 Auth DB 트리거/훅이 있으면 Auth 가입 자체가 500으로 실패할 수 있다.
이 경우도 원격 로그 없이 이번 SQL 누락 때문이라고 단정하지 않는다.

## 재현 절차와 판별

1. Expo 터미널을 Ctrl+C로 종료하고 mobile에서
   `npx.cmd expo start --clear`로 시작한다. Android Expo Go를 종료 후 새 QR로 연다.
2. 메일 수신이 가능한 본인 테스트 주소와 프로젝트 정책에 맞는 비밀번호를
   기기에서만 입력하고 한 번 가입한다. 비밀번호나 원본 오류는 채팅에 보내지 않는다.
3. 터미널의 `[DrMAS Auth]` 줄 중 event:error를 확인한다. 공유가 필요하면
   이 접두사의 구조화된 진단 줄만 공유하고, 다른 원본 로그·스크린샷은 제외한다.
4. 아래 구분에 따라 Dashboard 설정/로그를 사용자가 확인한다. 반복 가입은
   발송 제한을 유발할 수 있으므로 연속으로 누르지 않는다. Auth에 계정이 이미
   있다면 확인 메일 처리 후 로그인을 시도하며, 계정을 자동 삭제하지 않는다.

| 진단 단계·코드 | 의미와 확인할 항목 |
| --- | --- |
| signup:error + email_address_not_authorized | 기본 SMTP의 수신자 제한; SMTP 설정 확인 |
| signup:error + email_address_invalid | Auth에서 거부한 주소/도메인; 실제 수신 가능한 주소 확인 |
| signup:error + email_provider_disabled / signup_disabled | 이메일 제공자·가입 허용 설정 |
| signup:error + weak_password | Dashboard의 비밀번호 정책 |
| signup:error + over_email_send_rate_limit / 429 | 발송 제한; 대기 후 재시도 |
| signup:error + captcha_failed | 프로젝트 CAPTCHA와 앱 흐름의 연동 필요 |
| signup:error + 401/403 | 키·프로젝트 짝, 제공자/정책 확인; 상태만으로 키 오류 확정 금지 |
| signup:error + unexpected_failure / 500 | Auth 서버 로그의 트리거·훅·서버 오류 확인 |
| signup:error + AuthRetryableFetchError / AbortError | 기기 네트워크·요청 시간 초과 확인 |
| signup:confirmation_required | 인증 완료가 아니라 이메일 확인 대기 |
| signup:success 이후 profile:error + PGRST205/42P01 | Auth 이후 프로필 스키마 미준비 가능성; 별도 마이그레이션 검토 필요 |
| profile:error + PGRST116 | 프로필 행 없음 또는 RLS로 보이지 않음 |
| profile:error + 42501 | 테이블/컬럼 접근 권한 확인 |
| UNRECOGNIZED / AuthUnknownError | 원문을 공유하지 말고 단계·status·type으로 추가 조사 |

signup:success는 SDK 요청 처리 완료이지 홈 진입이나 계정 생성의 확정 로그가
아니다. 특히 이메일 확인/중복 난독화 응답은 로그인 완료로 해석하지 않는다.
프로필 누락의 해결을 위해 권한 검사를 우회하거나 SQL을 자동 적용하지 않는다.

## 검증

대체 SDK 테스트로 Auth 실패와 프로필 실패의 분리, 오류 매핑, 원문/알 수 없는
필드의 비밀값 비출력, production 무로그를 확인했다. 실제 계정 생성·메일
발송·SQL 실행은 수행하지 않았다. TypeScript 및 lint도 실행했다.
최종 결과: 모바일 테스트 36/36, TypeScript, lint 통과.

참고: [Supabase Auth 오류 코드](https://supabase.com/docs/guides/auth/debugging/error-codes).
