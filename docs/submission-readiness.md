# Dr.MAS 웹 공개 준비와 P0/P1 연동 결과

작성일: 2026-11-01 · DrMAS-Mobile

## 1. 결론과 실제 검증 범위

이번 작업은 P0/P1을 우선했다. 웹 세션 저장소, Dev/Production 구성 경계,
계정별 서버 복약 일정/기록 관리, Vercel 정적 빌드 경로를 추가했다.
기존 SSR 경로도 유지했다. 코드·자동 테스트·로컬 빌드는 확인했지만 **실제 API
연동 전체가 검증된 상태나 공개 URL 발급 완료 상태는 아니다.**

사용자가 전달한 DrMAS-Dev 테이블/RLS 적용과 A/B 기본 조회 성공은 사용자 확인
상태로 기록한다. 이번 에이전트가 원격에서 재검증한 결과로 집계하지 않는다.
기존 Cloudtype/원래 Supabase·Dev DB·실제 계정·실제 건강기록은 변경하지 않았다.

| 기능 | 구현 | 이번 검증 | 남은 검증/제약 |
| --- | --- | --- | --- |
| 인증·프로필·역할 | 기존 Auth/getUser/profiles/서버 역할 확인 유지 | 기존 대체 SDK·컨트롤러 회귀 | 실제 Dev URL/계정으로 가입/로그인·A/B·역할 확인 미실행 |
| 웹 로그인 유지 | sessionStorage 전용 web 모듈, SSR에서는 세션 없음 | 재생성/로그아웃/저장소 거부/SSR 단위 검사 | 실제 브라우저 로그인·새로고침 미검증. 탭 종료 시 세션 소실 |
| Native 로그인 유지 | 기존 SecureStore 유지 | 기존 chunk·삭제·실패 회귀 | 기기 검증 필요 |
| 서버 복약 | 일정 등록/조회/수정/보관·복원, 날짜별 체크/취소 upsert | 가상 Supabase 요청/응답·상태 하네스 | 실제 사용자 JWT 및 RLS 쓰기/조회 행렬 미검증 |
| 로컬 복약 | 기존 ID별·날짜별 저장소 보존 | 기존 보호 테스트 유지 | 서버로 자동 업로드·삭제·계정 귀속하지 않음 |
| 병원·약국 | 기존 검색 UI·API 계약·Edge·공유 제한 유지 | 모의 fetch/권한/입력·Origin·한도 검사 | 실제 Kakao/Redis/Edge 미호출. PUBLIC 플래그 false 유지 |
| AI | 기존 고정 미제공 안내 유지 | 기존 회귀 | OpenAI 연결 미구현. 실제 상담처럼 표시하지 않음 |
| 공공데이터/RAG | 미구현 | 명세 미확인 상태 유지 | 사용자 요청에 따라 서비스명/공식 문서 전달 전 보류 |
| 웹 배포 | SSR/정적 빌드·정적 Vercel 설정 | 로컬 export/HTTP 검사 | Vercel 미배포. 공개 URL 없음 |
| 보호자·SOS | 기존 승인 경계·기기 상태 유지 | 기존 회귀 | 보호자 서버 복약 조회 UI·실제 외부 SOS 미구현 |

## 2. 변경 파일

| 파일 | 목적 |
| --- | --- |
| mobile/src/services/secureSessionStorage.web.ts | 브라우저 전용 탭 세션, SSR 접근 차단 |
| mobile/src/services/supabase.ts | 명시한 환경·예상 프로젝트 ref와 실제 호스트 불일치 차단 |
| mobile/app.config.ts | 공개 키/URL 사전 검증, 환경 metadata, 정적 출력 선택 |
| mobile/.env.example | 공개 환경 이름·예상 프로젝트 ref 안내 |
| mobile/config/development.env.example | Dev용 빈 템플릿 |
| mobile/config/production.env.example | 별도 승인된 Production용 빈 템플릿 |
| mobile/scripts/check-public-env.cjs | .env 이름·존재·형식·일치 여부만 출력하는 읽기 전용 검사 |
| mobile/scripts/build-web.cjs | 기존 SSR과 구분되는 Vercel 정적 빌드 |
| mobile/vercel.json | build/output/cleanUrls/기본 응답 헤더 |
| mobile/package.json | build:web, check:public-env, test:readiness 명령 |
| mobile/src/services/medicationRepository.ts | JWT actor 확인·엄격한 입력/응답·일정/기록 저장소 |
| mobile/src/features/medications/useCloudMedications.ts | 조회·변경·날짜·실패·이전 요청 수명주기 |
| mobile/src/components/CloudMedicationPanel.tsx | 환자 계정의 서버 일정 관리 |
| mobile/src/screens/MedicationScreen.tsx | 계정 기록과 기기 예시 기록 구분 |
| mobile/src/screens/PatientHome.tsx | 홈 요약이 기기 예시임을 명확히 표시 |
| mobile/src/components/ui.tsx | 웹 페이지 폭 최대 960, Native 레이아웃 유지 |
| mobile/src/app/+html.tsx | SDK 58 문서 컨텍스트·한국어 문서 언어 |
| mobile/src/app/index.tsx, places.tsx | 초기 HTML 제목·설명 metadata |
| mobile/scripts/test-readiness.cjs | 새 저장소/환경/서버 복약 보호 검증 |
| mobile/scripts/test-supabase.cjs | app.config 검사 VM에 표준 URL global 제공 |
| docs/submission-readiness.md | 본 보고서·JWT 검사·배포 절차 |

기존 작업 트리에는 이전 작업 변경이 있다. Git HEAD와의 전체 차이를 이번 변경으로
집계하지 않는다. 이번에 패키지 설치·SQL 파일 수정·기존 서버 수정은 하지 않았다.

## 3. 환경 설정과 로컬 Dev 준비

현재 mobile/.env를 읽기 전용 형식 검사했다. 공개 URL/키의 형식은 통과했지만
EXPO_PUBLIC_APP_ENV와 EXPO_PUBLIC_EXPECTED_SUPABASE_REF는 미설정이었다.
실제 URL/키는 출력하지 않았다. 따라서 현재 값이 DrMAS-Dev인지 확정할 수 없다.
파일 내용을 덮어쓰거나 자동으로 다른 프로젝트로 전환하지 않았다.

| 위치 | 이름 | 설정 |
| --- | --- | --- |
| mobile/.env 및 Vercel 환경변수 | EXPO_PUBLIC_APP_ENV | development 또는 production |
| 동일 | EXPO_PUBLIC_EXPECTED_SUPABASE_REF | 사용자가 대시보드에서 확인한 해당 프로젝트 ref |
| 동일 | EXPO_PUBLIC_SUPABASE_URL | 같은 프로젝트의 HTTPS Project URL |
| 동일 | EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 같은 프로젝트의 sb_publishable 공개 키 |
| 동일 | EXPO_PUBLIC_PLACES_FUNCTION_URL | 승인·배포된 검색 함수의 공개 URL. 준비 전 빈 값 |
| 빌드 프로세스 전용 | DRMAS_WEB_OUTPUT | build:web가 static으로 설정. 기본 직접 export는 server 유지 |
| 검색 함수 Secrets | KAKAO_REST_API_KEY | REST 키, 클라이언트 변수 금지 |
| 검색 함수 Secrets | UPSTASH_REDIS_REST_URL/TOKEN | 기존 공유 제한 저장소 설정 |
| 검색 함수 설정 | SEARCH_PUBLIC_ENABLED | false 유지 |
| 검색 함수 설정 | SEARCH_ALLOWED_ORIGINS / SEARCH_MAX_PER_MINUTE/DAY/MONTH | 허용 Origin/서비스 전체 상한 |

OPENAI_API_KEY는 미래 AI 함수의 서버 Secrets에만 둘 값이다. 이번 코드에서는 읽지
않으며 설정할 필요가 없다. 공공데이터 키도 미확인 API에 임의 연결하지 않는다.

Dev 준비 순서:

1. 사용자가 현재 설정을 보존한 뒤 직접 mobile/.env를 편집한다. 자동 복사/덮어쓰기
   명령은 제공하지 않는다. config/development.env.example은 이름 참고용이다.
2. DrMAS-Dev 대시보드의 이름·ref를 확인하고 URL·공개 키·예상 ref를 같은 프로젝트로
   맞춘다. 기존 프로젝트 값이나 Secret/service_role 키를 가져오지 않는다.
3. `npm.cmd run check:public-env`로 값이 아닌 형식·일치 여부만 확인한다.
   두 환경 필드를 지정하지 않은 기존 설정은 호환성을 위해 동작하지만 새 guard로
   프로젝트 선택을 확인한 것으로 간주하지 않는다.
4. 설정을 바꾼 뒤 Expo를 재시작한다. 가상 테스트 계정 A/B로 로그인하고 profiles
   역할과 홈 이동을 확인한다. 클라이언트 역할 선택·metadata는 권한 근거가 아니다.
5. 성공 전 외부 배포 환경에 값을 복사하지 않는다. Vercel의 Production 배포 컨텍스트와
   데이터 환경 라벨은 별개다. 제출용 Dev 데이터 프로젝트를 쓰면 라벨도 development다.

## 4. 복약 동작과 실제 JWT RLS 검사

새 환자 영역은 Supabase SDK의 현재 사용자 JWT를 사용한다. 쓰기 직전에 getUser로
actor ID를 확인하고, payload/필터의 patient_id를 해당 ID에 고정한다. role/owner 변경,
admin 클라이언트, service_role, 로컬 기록 읽기/이전/삭제는 없다.
UI의 검사만으로 서버 권한이 검증됐다고 보지 않으며 최종 권한은 RLS다.

일정 삭제는 **보관(active=false)**으로 구현했다. 복약 이력이 있는 일정을 hard delete하지
않으며 복원이 가능하다. 체크 취소도 row 삭제 대신 taken=false/taken_at=null로 저장한다.
새 일정은 Asia/Seoul이고 기존 일정 수정은 기존 timezone을 유지한다. 기본 기록 날짜는
한국 기준이며 사용자가 다른 날짜를 조회·적용할 수 있다. 전 세계 시간대 자동 변환은
이번 범위 밖이다. 현재 스키마는 일정별 하루 체크 한 개이며 다회 복용/횟수 모델은 별도다.

서버 조회 실패 시 기기 예시나 빈 기본 일정을 실제 기록처럼 대체하지 않는다.
저장 성공 응답 후 상태를 반영한다. 불확실한 쓰기 실패는 편집을 잠그고 재조회를 요구한다.
같은 날짜 재적용은 no-op이고 계정 전환/unmount 이후 이전 응답은 무시한다.

실제 JWT 검사에는 **Dev의 가상 계정과 별도 승인된 disposable 일정**만 사용한다.
SQL Editor의 owner 조회나 auth.uid 주입으로 대체하지 않는다. 이번에는 실행하지 않았다.

| 주체/검사 | 기대 결과 |
| --- | --- |
| 환자 A 자기 profiles 조회 | A만 반환, role은 서버 값 |
| A가 B profiles/medications/records 조회 | B 행 0개 또는 권한 오류. fixture가 실제 존재해야 의미 있음 |
| A 일정 생성/수정/보관/복원·A 체크/취소·재로그인 | 소유권 유지, 저장 상태 복원 |
| A가 patient_id=B payload로 insert/upsert | 차단 |
| A가 B 일정/기록 update/delete | 변경 없음 또는 차단, B로 재조회해 불변 확인 |
| A의 role/owner 수정 또는 care_links 직접 상태 변경 | 차단, 서버 값 불변 |
| 비로그인 요청 | 개인정보/건강정보 읽기·쓰기 차단 |
| 미승인 보호자 | 해당 환자 복약/기록 읽기 차단 |
| 환자가 승인한 보호자 | 허용된 환자 복약/기록 읽기만, 쓰기 차단 |
| 승인 철회 후 보호자 | 새 조회에서 접근 차단 |
| 만료/폐기 refresh session·다른 계정 로그인 | 홈/캐시 잠금, 다른 계정 기록 혼합 없음 |

fixture 생성·권한 변경·테스트 쓰기/정리는 원격 변경이므로 사전 승인이 필요하다.
고유한 test fixture를 식별하고 기존 기록을 지우는 정리를 하지 않는다.
Access JWT의 만료 전 즉시 무효화를 로그아웃 보장으로 오인하지 않는다.

## 5. 병원·약국 검색 검토

기존 places/search-places를 유지했다. 입력 크기/좌표/카테고리·고정 외부 URL·timeout·
응답 검증·정확한 Origin·Redis 원자 카운터가 있고, 설정/Redis 실패 시 차단한다.
CORS는 인증이 아니고 native의 Origin 생략도 전체 한도 검사를 거친다.

SEARCH_PUBLIC_ENABLED=false를 그대로 유지했다. 공유 한도 소진 공격, Redis 상태/eviction,
Edge/Redis 자체 요청 비용, 실제 Lua 경쟁과 Kakao 쿼터는 운영 검증이 남아 있다.
실제 공개 호출을 승인하기 전 낮은 Dev 한도로 성공/429/Redis 장애/거부 Origin/잘못된
입력/공급자 오류를 테스트하고 비용 제한과 중지 방법을 확인해야 한다.
키/공개 주소가 없으면 앱은 설정 상태를 표시하며 모의 기관을 보여주지 않는다.
[기존 검색 보호 보고서](places-search.md)

## 6. 웹 빌드·배포 구성과 검증

기본 `npx.cmd expo export --platform web`은 기존 server output을 유지한다.
이 산출물은 client/server를 포함하며 단순 정적 dist가 아니다.
Vercel은 이번에 준비한 **`npm.cmd run build:web` → static output → dist** 경로를 선택한다.
서버 API는 Supabase Edge Functions이므로 이 프런트엔드에 SSR 런타임은 필요하지 않다.
SSR을 Vercel에서 유지하려면 별도로 공식 어댑터를 구현·검증해야 하며 현재 vercel.json은
SSR 산출물을 배포하도록 만든 설정이 아니다.

브라우저 세션은 sessionStorage에 두어 새로고침은 유지하지만 탭을 닫으면 사라진다.
SSR에는 사용자 세션을 서버 전역으로 저장하지 않는다. Native SecureStore는 그대로다.
브라우저 JS가 세션을 다루므로 XSS 방어·로그·확장 프로그램 노출 관점이 남는다.
HttpOnly cookie BFF 방식과 동등한 보안이라고 주장하지 않는다. CSP는 export의 inline
스크립트/스타일과 함께 검토해야 하므로 검증 없이 임의의 강한 정책을 넣지 않았다.

웹 공통 콘텐츠 폭 960, 기존 반응형 타일/Native 유지, 한국어 html lang, 초기 페이지
제목/설명을 적용했다. 실제 데스크톱/모바일 시각·키보드·TalkBack 실측은 하지 않았다.
브라우저 자동화 host 연결이 없어 로그인/복약의 실제 hydration·클릭 검증은 미완료다.

이번 검증은 실제 환경값을 제외한 offline export를 .expo/readiness-ssr 및
.expo/readiness-static에 생성했다. 따라서 배포용 설정이 입력된 산출물이 아니다.
로컬 expo serve의 `/`와 `/places`는 HTTP 200, root/script/한국어 lang/제목을 확인했다.
로컬 URL은 제출 가능한 공개 URL이 아니다.

자동 검증: 모바일 기존 83건+새 준비 검사 12건=95건, TypeScript·lint.
추가 RLS 정적 검사는 PostgreSQL/JWT 실행 검사와 구분한다. 새 시험은 가상 저장소,
SDK 요청/응답, 환경/manifest와 stale 작업을 검증하며 원격 API를 호출하지 않는다.
공개 환경 검사에서 비밀 prefix 후보 0, .env/환경별 local 파일의 Git 제외를 확인했다.
키 탐지는 모든 비밀이나 과거 Git 이력의 무위험을 보증하는 검사가 아니다.

최종 실행 결과:

| 항목 | 결과 |
| --- | --- |
| 모바일 전체 자동 검사 | 95/95 통과 |
| RLS 정적 검사 | 9/9 통과, 실제 JWT/DB 검사 아님 |
| npx.cmd --no-install tsc --noEmit | 통과 |
| npm.cmd run lint (dotenv 비활성) | 통과, 경고 없음 |
| npx.cmd expo export --platform web | SSR output 성공, 검증용 출력 경로 사용 |
| build-web.cjs --output-dir .expo/readiness-static | static HTML 4개 route 생성 성공 |
| 로컬 expo serve | localhost:18917에서 실행, / 및 /places HTTP 200 |
| 실제 브라우저/모바일 화면 | 미검증, 자동화 browser host 연결 불가 |

위 로컬 서버는 검토용으로 실행 중이며 외부 배포가 아니다. 환경값 없는 검증용
산출물을 사용하므로 여기서 실제 Dev 로그인 성공을 확인했다고 볼 수 없다.

## 7. 공개 URL까지 남은 정확한 순서

1. 사용자가 Dev 환경 값·예상 ref를 직접 설정하고 형식 검사 및 실제 A/B 로그인 확인.
2. 위 JWT 행렬과 서버 복약의 새로고침/계정 전환/날짜·실패 경로 검증. 미검증이면
   검증 완료로 표시하지 않는다. 승인된 Dev fixture 외 데이터는 사용하지 않는다.
3. 검색이 필수라면 서버 Secrets/공유 제한/비용 보호 준비 → 별도 승인 후 Dev Function
   배포·실호출 검증 → 공개 활성화 판단. 준비가 안 되면 false와 정확한 미제공 안내 유지.
4. Vercel 프로젝트 Root Directory=`mobile`, Framework=`Other`, Install=`npm ci`,
   Build=`npm run build:web`, Output=`dist`, Node=`24.x` 설정 준비.
   로컬 Expo/RN engine은 24.3 이상을 지원하고 Vercel 24.x 지원을 공식 문서로 확인했다.
5. Vercel 해당 배포 컨텍스트에 위의 **공개** 환경값만 설정한다. Kakao/OpenAI/Redis
   비밀은 넣지 않는다. Supabase Auth Site URL·redirect 허용 주소와 함수 Origin은 실제
   승인할 도메인으로 사용자가 준비한다. wildcard로 임시 개방하지 않는다.
6. 배포 환경값으로 정적 빌드를 다시 만들고, 키 점검·타입/lint/자동 검증과 실제 브라우저
   시작/로그인/복약/places 새로고침·직접 URL·모바일 폭·오류 상태를 확인한다.
7. **사용자 승인 후에만** Vercel Preview 배포. Preview에서 세션/권한/Origin/asset/경로를
   확인한 뒤 Production 공개도 별도 승인한다. 이번 작업에서는 둘 다 하지 않았다.

추가 확인: 새 Vercel 프로젝트의 첫 배포는 공식 문서상 Preview 요청도 Production으로
분류된다. 위 7번은 기존 배포 이력이 있는 프로젝트에 적용한다. 신규 프로젝트의 첫
배포에는 별도 승인이 필요하다. 상세 메뉴/조건은 [Dev·Preview 실행 안내](dev-preview-runbook.md)를 따른다.

이 순서에는 사용자 설정과 실제 API 검증이 남아 있다. 단순히 배포 버튼만 누르면
검증된 전체 기능의 사이트가 된다고 판단하지 않는다.

## 8. 후속 우선순위

- P0: Dev 환경 확정, 실제 로그인/프로필/역할/브라우저 세션, 승인 후 웹 배포.
- P1: JWT RLS 전체 행렬·실제 복약 기록, 보호자 읽기 UI, 검색의 Redis/Kakao 실검증.
- P2: P0/P1과 공개 준비를 지연시키지 않도록 OpenAI는 이번에 확장하지 않았다.
  다음 단계는 인증된 Edge 요청·서버 Secret·공유 호출량 제한·timeout·중복 제출·
  응급 도움 우선·진단/처방/용량 변경을 확정하지 않는 답변 정책과 가상 질문 평가다.
- P3: 사용자 제공 서비스명/공식 문서 확인 후 API 기능을 확정한다. 그 전엔 URL이나
  데이터를 만들지 않는다. 승인된 문서의 출처/개정일/발췌 → 권한 있는 검색 →
  답변 → 실제 검색된 문서만 인용하는 작은 검색부터 진행한다. 현재 RAG라고 표시하지 않는다.

원격 업무 API 호출, SQL 실행, Cloudtype/기존 Supabase 변경, Edge/Vercel 배포,
Git commit/push는 수행하지 않았다. 실제 .env·API 비밀·비밀번호도 바꾸거나 출력하지 않았다.

참고: [Expo 정적 배포](https://docs.expo.dev/guides/publishing-websites/),
[SDK 58 정적 metadata](https://docs.expo.dev/router/web/static-rendering/),
[SSR 런타임](https://docs.expo.dev/router/web/server-rendering/),
[Vercel Node 지원](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
