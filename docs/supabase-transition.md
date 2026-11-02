# Supabase 전환 준비

작성일: 2026-11-01 (Asia/Seoul), 브랜치: DrMAS-Mobile

## 현재 변경 범위

앱의 기본 인증 서비스는 Supabase다. 이전 MariaDB 서비스는
`mobile/src/services/auth.mariadb.ts`에 그대로 보존했다. 기본 서비스는
이를 import하거나 장애 시 자동 fallback하지 않는다. 기존 mobile-api,
mas_project 및 MariaDB 마이그레이션은 이 작업에서 수정하지 않았다.

UI 디자인과 화면 컴포넌트는 수정하지 않았다. 복약의 기기·날짜별
AsyncStorage 동작, AI 메시지 및 SOS 타이머도 유지했다. cloud 복약 서비스는
별도로 준비했으며 기존 예시 일정을 처방으로 간주하거나 자동 업로드하지 않는다.

## 인증과 세션

- 패키지: @supabase/supabase-js, react-native-url-polyfill. Expo SDK 58 환경에서
  expo install로 추가했다. 기존 SecureStore와 AsyncStorage는 유지했다.
- `services/supabase.ts`: 환경변수 검증 후 지연 생성하는 단일 클라이언트.
  설정이 없으면 생성·연결을 시도하지 않고 CONFIG 오류를 표시한다.
  Expo Go에서 런타임 환경변수가 누락되는 경우에는 app.config.ts가 전달한
  Constants.expoConfig.extra의 공개 설정 쌍을 동일 검증 후 사용한다.
  [설정 오류 진단과 재시작 안내](supabase-env-troubleshooting.md)를 참고한다.
- 환경변수는 EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY다.
  HTTPS 프로젝트 origin과 `sb_publishable_` 키만 허용한다. 기존 anon JWT를
  넣는 방식은 지원하지 않는다. service_role, sb_secret_, DB 비밀번호는
  앱 환경변수에 절대로 넣지 않는다. 공개 키 자체는 RLS의 대체물이 아니다.
- `services/auth.ts`: SDK signUp/signInWithPassword/getUser/signOut을 사용한다.
  getUser로 검증한 UUID의 profiles를 읽어 역할을 결정한다. 기기 역할 선택이나
  user_metadata의 role은 권한 근거로 사용하지 않는다.
- 가입 후 session이 없으면 이메일 확인 안내와 로그인 화면을 유지한다.
  기존 이메일의 난독화 응답도 로그인 성공으로 취급하지 않는다. Supabase가
  명시적으로 중복 코드를 반환할 때만 중복 오류로 표시한다.
- 보호자 자가 가입은 앱에서 차단한다. 직접 Auth API를 호출해 우회해도
  DB 트리거는 무조건 patient 역할로 프로필을 만든다. guardian 승격은
  검증된 관리자 절차와 서버 권한으로만 수행해야 한다.
- SDK가 refresh token을 포함한 전체 세션을 저장한다. readToken/saveToken은
  기존 컨트롤러 인터페이스를 유지하기 위한 어댑터이며, 별도의 토큰 발급이나
  MariaDB 토큰 저장을 하지 않는다. 이전 토큰은 읽거나 이전하지 않는다.
- SecureStore에 Unicode 기준 300문자 단위로 암호화 저장하고 마지막에
  manifest를 게시한다. 단일 Keychain 항목의 큰 payload 제한을 피하며,
  AsyncStorage나 평문 파일로 fallback하지 않는다. 웹 등 SecureStore 미지원
  환경에서는 저장 오류로 실패한다. 지원 대상은 iOS/Android 네이티브 앱이다.
- manifest를 기준으로 읽기·쓰기·삭제를 직렬화한다. 실패한 새 쓰기는 이전
  세션을 보존한다. 이전 chunk 정리 실패나 손상된 manifest가 있는 경우
  참조되지 않는 암호화 chunk가 남을 수 있다. 정상 재인증 데이터로 사용하지
  않으며 기기 QA와 운영 저장소 정리 정책이 필요하다.
- AppState에 따라 token auto-refresh를 시작·중지하고 SIGNED_OUT 이벤트 시
  홈을 잠근다. 이벤트 콜백 안에서 비동기 Auth 호출을 하지 않는다.
- signOut(scope local)은 현재 세션의 서버 폐기를 요청한다. 원격 오류 시에도
  로컬 저장을 제거하고 실패를 표시한다. 삭제 자체가 실패하면 재시도가 필요하다.
  이미 발급된 JWT는 만료까지 유효할 수 있으므로 즉시 전체 세션 무효화를
  보장한다고 표현하지 않는다. 다른 기기의 세션을 일괄 종료하지 않는다.
- 네트워크 요청에는 15초 제한을 두고 SDK가 요구하는 원래 abort signal도
  전달한다. Auth 재시도에 따라 전체 사용자 동작은 더 오래 걸릴 수 있다.

## PostgreSQL 마이그레이션과 권한

파일: `supabase/migrations/202611010001_auth_and_care.sql`.
원격·로컬 PostgreSQL 모두에 실행하지 않은 검토용 SQL이다.
후속 정적 검토와 로컬 테스트 SQL·백업/복구 계획은
[RLS 심층 검토](supabase-rls-review.md)에 정리했다. 실제 DB 실행은 미검증이다.
BEGIN/COMMIT으로 한 번 적용하며, 기존 테이블과 이름 충돌 시 실패한다.
기존 Supabase 사용자의 자동 backfill도 하지 않는다. 비어 있는 별도 개발
프로젝트를 우선 사용하고, 기존 프로젝트라면 스키마·사용자·권한을 검토한다.

| 테이블 | 목적 | 앱에서 허용하는 접근 |
| --- | --- | --- |
| profiles | auth.users UUID, 표시 이름, 서버 역할 | 본인 조회·이름 변경만 |
| medications | 환자의 복약 일정·기기 시간대 | 환자 본인 CRUD, 승인된 보호자 읽기 |
| medication_records | 일정별 날짜·복용 여부·복용 시각 | 환자 본인 CRUD, 승인된 보호자 읽기 |
| care_links | 보호자 요청·환자 승인·철회 기록 | 당사자 조회, 쓰기는 승인 RPC만 |

모든 테이블에 RLS를 활성화하고 public/anon/authenticated의 기본 권한을
회수한 뒤 최소 권한만 부여했다. profiles에는 role UPDATE 및 INSERT/DELETE
권한이 없다. auth.users 트리거의 trusted SECURITY DEFINER 함수만 초기 프로필을
생성한다. role은 client metadata나 JWT user_metadata에서 복사하지 않는다.

보호자 요청은 서버에서 guardian 역할을 확인한다. 요청 자체는 pending이고
데이터 읽기를 허용하지 않는다. 환자 본인만 승인할 수 있고, 양측 모두 철회할
수 있다. 승인된 관계와 현재 DB 역할을 읽기 정책이 매번 확인한다. 철회된
관계는 요청 반복으로 되살리지 않는다. 재연결 절차는 별도 승인 설계가 필요하다.

함수는 빈 search_path와 한정된 스키마 이름을 사용하고, 익명 실행을 허용하지
않는다. 역할 조회 helper는 재귀 RLS를 피하도록 trusted owner로 실행한다.
service_role은 서버의 관리용 신뢰 경계이며 앱에는 전달하지 않는다.
medication_records의 복합 외래키는 다른 환자의 일정에 기록을 붙이지 못하게 한다.

현재 준비한 request RPC에는 UUID가 필요하다. 앱에서 환자 목록을 공개 검색하는
기능은 없다. 실제 연결 UX에는 환자가 공유하는 초대 정보, 요청 제한, 스팸 방지,
동의 설명·감사 로그가 추가로 필요하다. 승인으로 이미 내려받은 데이터를 원격
기기에서 지우는 것까지 보장하지 않는다.

## 사용자가 Supabase Dashboard에서 준비할 항목

1. MariaDB와 별개의 개발용 Supabase 프로젝트를 준비한다. 프로젝트 URL과
   publishable key를 확인해 private mobile/.env에 직접 설정하고 Expo를 재시작한다.
   실제 값은 채팅·커밋·로그에 넣지 않는다.
2. Auth에서 이메일/비밀번호 제공자, 최소 비밀번호 길이 8자 이상,
   이메일 확인 정책을 설정한다. SMTP·발송 제한·메일 템플릿을 점검한다.
3. 확인 메일의 Site URL/Redirect URL을 실제 소유한 확인 페이지에 설정한다.
   현재는 외부에서 이메일 확인 후 앱에서 비밀번호로 로그인하는 흐름이다.
   앱 내 PKCE callback·비밀번호 재설정·소셜 로그인 화면은 아직 구현하지 않았다.
4. 마이그레이션 SQL과 권한을 검토하고 별도 승인 후 개발 프로젝트에만 먼저
   적용한다. Auth 트리거 실패는 가입을 막을 수 있으므로 가상 계정으로 검증한다.
5. patient A/B, 승인된 guardian, 미승인 guardian, anon으로 실제 RLS를 검사한다.
   임의 역할 변경, 다른 환자 쓰기, 자기 승인, 철회 후 읽기를 모두 거부해야 한다.
6. guardian 승인 담당자·검증 자료·감사 기록을 정한다. public signup metadata로
   역할을 승격하거나 service_role 키를 앱에 넣어 우회하지 않는다.
7. 네이티브 빌드에서 가입·메일 확인·로그인·종료/재실행·백그라운드 복귀·
   자동 갱신·오프라인·저장 실패·로그아웃을 검사한다. 민감정보 처리·보관·삭제
   정책과 백업 복구 계획을 마련한 후에만 운영 전환을 별도로 승인한다.

## 검증과 한계

최종 검사 결과: 모바일 테스트 28건, 기존 mobile-api 17건, 웹서버 설정
테스트 6건으로 총 51건 통과. mobile의 `npx tsc --noEmit`과 `npx expo lint`,
두 서버 패키지의 `npm run check`, `git diff --check`도 통과했다.
설치된 SDK는 @supabase/supabase-js 2.118.0, URL polyfill 4.0.0이다.

재실행: mobile에서 `node --test scripts/test-auth.cjs scripts/test-auth-integration.cjs scripts/test-supabase.cjs`,
`npx tsc --noEmit`, `npx expo lint`를 실행한다. mobile-api와 mas_project에서는
각각 `npm test`, `npm run check`를 실행한다. 실제 DB/HTTP 실행기는 이번
검사에 사용하지 않았다.

기존 MariaDB 서비스 테스트는 보존된 auth.mariadb.ts를 명시적으로 대상으로
실행한다. 기존 mobile-api를 삭제하거나 새 기본 경로로 계속 호출하는 것이 아니다.
Supabase 테스트는 SDK 대체 구현으로 설정 누락, 서비스 키 거부, 이메일 확인,
서버 프로필 역할, 오류·로그아웃·AppState를 검사한다. SecureStore chunk와
마이그레이션 정책 구조도 검사한다. 이 테스트는 실제 Supabase 인증이나
PostgreSQL RLS 실행의 성공을 입증하지 않는다.

Cloudtype 접속·변경, Supabase 원격 DB 변경, 앱/서버 배포, Git commit/push는
수행하지 않았다. 실제 프로젝트 키가 없으므로 연결 성공도 주장하지 않는다.

공식 문서:
[React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Expo SDK 58 SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/).
