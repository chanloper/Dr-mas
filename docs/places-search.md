# 병원·약국 검색 구현과 공개 전 검증

작성일: 2026-11-01 · DrMAS-Mobile

## 현재 완료 범위

로그인 없이 열리는 Expo Router `/places` 화면, 병원/약국 선택, 지역명·기관명
검색, 명시적으로 요청하는 현재 위치 주변 3km 검색, 목록·페이지 추가·상세 링크,
로딩·빈 결과·위치 거부·연결/설정/사용량 오류 표시를 구현했다.
Welcome/Auth/서비스 카드/환자 홈에서 진입한다. 인증 컨트롤러나 권한을 우회하거나
가짜 로그인 계정을 만들지 않는다. `/places` 직접 진입은 인증 초기화에도 의존하지 않는다.

실제 Supabase/Kakao/Redis 호출과 Edge Function 배포는 하지 않았다.
공개 활성화 기본값은 **false**다. 따라서 현재는 화면/권한 요청/입력 검증과
오류 안내를 실행할 수 있지만 실제 기관 목록이 나온다고 주장하지 않는다.
모의 기관 데이터는 test-places.cjs에만 있으며 앱·서버에는 대체 결과를 넣지 않았다.

## 데이터 흐름과 공급자 계약

앱 → 공개 search-places Edge Function → 공유 요청 한도 확인 → Kakao Local REST API.
DB·Supabase admin/service_role 클라이언트는 사용하지 않는다.

- 병원 HP8 / 약국 PM9로 카테고리를 제한한다.
- 주변 검색: category.json, x=경도/y=위도, radius=3000, sort=distance.
- 키워드 검색: keyword.json, category 필터, sort=accuracy. 위치 권한을 요청하지 않는다.
- 한 페이지 15개, 최대 3페이지다. 더 보기 실패 시 마지막 성공한 요청의 다음 페이지를 재시도한다.
- 응답은 기관 이름·카테고리·지번/도로명 주소·전화·거리·장소 상세 URL로 변환한다.
- 없는 주소/전화는 없는 상태로 전달한다. 화면에는 ‘정보 없음’을 표시하며 만들어내지 않는다.
- 거리 필드는 요청에 좌표가 있을 때 제공자의 숫자 거리만 사용한다. 키워드 검색은
  좌표 없이 수행하므로 거리를 표시하지 않는다. 이동 시간/경로 거리는 제공하지 않는다.
- 상세 링크는 place.map.kakao.com의 숫자 장소 경로만 허용하고 HTTPS로 연다.
- 결과가 없으면 빈 배열 그대로 표시한다. 영업 여부·응급실 가용 여부·의료적 품질
  정보는 추론하지 않으며 화면에 한계를 안내한다.

[Kakao Local 공식 명세](https://developers.kakao.com/docs/ko/local/dev-guide)

## 환경변수: 실제 값은 사용자가 직접 설정

| 위치 | 이름 | 성격·설정 |
| --- | --- | --- |
| mobile/.env | EXPO_PUBLIC_PLACES_FUNCTION_URL | 배포·보호 검증 후 본인 프로젝트의 `/functions/v1/search-places` HTTPS 주소. 공개 주소이며 키 아님 |
| Edge Function Secrets | KAKAO_REST_API_KEY | Kakao Developers 앱의 REST API 키. 모바일·manifest·공개 환경변수에 넣지 않음 |
| Edge Function Secrets | UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN | 별도 공유 Redis REST 서버 주소와 비밀 토큰. 전용 인스턴스 권장 |
| Edge Function 설정 | SEARCH_PUBLIC_ENABLED | 기본 false. 운영 한도·보호 검증 전 true로 바꾸지 않음 |
| Edge Function 설정 | SEARCH_ALLOWED_ORIGINS | 허용할 브라우저 Origin을 쉼표로 구분. 정확히 일치해야 함. 기본 빈 값은 브라우저 Origin 거부 |
| Edge Function 설정 | SEARCH_MAX_PER_MINUTE | 전체 서비스 분당 기본 30, 허용 범위 1~60 |
| Edge Function 설정 | SEARCH_MAX_PER_DAY | UTC 일간 전체 기본 500, 허용 범위 1~1000 |
| Edge Function 설정 | SEARCH_MAX_PER_MONTH | UTC 월간 전체 기본 5000, 허용 범위 1~10000 |

예제는 mobile/.env.example과 supabase/functions/search-places/.env.example에 있다.
실제 .env는 새로 만들거나 수정하지 않았다. Supabase Secret/service_role 키와
DB 비밀번호는 필요하지 않다. 기존 Auth 공개 키 설정과 검색 주소는 독립적이다.
앱은 검색 요청에 인증 토큰·공개 API 키도 붙이지 않는다.
표준 `*.supabase.co/functions/v1/search-places` 주소만 허용한다.
로컬 HTTP·사용자 지정 도메인은 현재 지원하지 않는다.

공개 주소는 정적 process.env 참조와 Expo Go manifest의 명시적 allowlist로 전달한다.
전체 process.env나 카카오 키를 manifest에 복사하지 않는다. 설정 변경 뒤 Metro를 재시작한다.

## 공개 호출 보호와 현재 제약

supabase/config.toml은 이 함수에만 verify_jwt=false를 지정한다. 이것은 인증 오류를
회피하는 private API가 아니라 비회원용 읽기 서비스의 설정이다. 다른 인증/RLS 설정은
변경하지 않는다. 비회원 함수도 아래 조건이 없으면 실패하며 카카오를 호출하지 않는다.

1. 활성화 플래그·카카오 키·Redis URL/토큰·유효한 한도 설정이 모두 필요하다.
2. 입력은 JSON POST, 2KB 이하, 3초 이내 읽기, 엄격한 모드/카테고리/문자열 길이/
   유한 좌표/페이지 범위/허용 필드만 받는다. 임의 URL·반경·페이지 크기를 받지 않는다.
3. Upstash Redis EVAL 한 번에서 분·일·월 카운터를 원자적으로 확인/증가시킨다.
   세 키 중 하나라도 한도에 도달하면 외부 검색을 하지 않는다. Redis 오류·timeout·
   예상하지 못한 응답도 실패 처리하며 메모리 제한만 사용하는 fallback은 없다.
4. 카카오 목적지는 코드의 고정 HTTPS 호스트·경로다. 입력으로 URL을 바꿀 수 없다.
   외부 요청/응답 읽기에 timeout과 본문 크기 상한을 적용한다. 자동 공급자 재시도는 하지 않는다.
5. 서버는 좌표·검색어·IP·키·토큰·원본 오류를 로그/Redis에 저장하지 않는다.
   Redis에는 시간 구간별 전체 사용량 숫자만 저장한다. 응답에는 고정 오류 코드만 담는다.
6. 브라우저는 정확한 Origin 허용 목록을 적용한다. 네이티브 앱에는 Origin이 없을 수
   있으므로 허용하지만 같은 전체 한도를 적용한다. 클라이언트 IP 헤더를 신뢰하지 않는다.

**아직 안전한 공개 운영을 검증한 상태는 아니다.** 현재 환경에 배포된 함수·연결된 Redis·
검증된 운영 보호 장치가 없다. 테스트는 HTTP Request/Response와 fetch 대체 함수만 사용한다.
Lua의 실제 Redis 실행, 다중 isolate 경쟁, 만료·장애·카카오 쿼터는 실검증하지 않았다.
공개 플래그를 false로 유지해야 한다. 한도 코드가 있다는 이유로 배포 준비 완료로 판단하지 않는다.

남는 위험과 활성화 전 조건:

- CORS와 앱의 버튼 제한은 인증/남용 방지 수단이 아니다. Origin은 비브라우저에서
  생략/위조할 수 있다. 현재 구현은 전체 공유 한도이며 사용자/IP별 공정한 할당은 없다.
  공격자가 공유 한도를 먼저 소진하면 정상 사용자도 검색하지 못할 수 있다.
- 카카오 호출 상한은 Redis 카운터의 보존·일관성에 의존한다. 전용 저장소·eviction 방지·
  카운터 초기화 금지·권한과 다중 요청 원자성 검증이 필요하다. 다른 연동에서 쓰는
  카카오 키의 사용량은 이 함수의 카운터로 제한되지 않는다.
- 한도 검사 자체도 Edge/Redis 요청 비용을 발생시킨다. 이 코드는 플랫폼 전체 청구의
  하드 상한을 보장하지 않는다. 계정/플랜별 지출 제한·쿼터·알림·즉시 중지 방법과
  신뢰할 수 있는 진입점의 WAF/속도 제한 또는 앱 검증 수단을 먼저 결정해야 한다.
- 해당 통제가 준비되지 않으면 공개 활성화를 보류한다. client 비밀키나 공유 비밀번호,
  위조 가능한 install ID, 메모리 카운터로 대체하지 않는다.
- 로그를 남기지 않는 것은 자체 코드의 동작이다. 호스팅·공급자 측 로그 보관과 접근 권한은
  별도로 확인해야 한다. 향후 관측에는 민감정보 없는 집계/고정 오류 코드만 사용한다.

[Supabase 공개 함수 설정](https://supabase.com/docs/guides/functions/auth),
[Upstash REST 공식 문서](https://upstash.com/docs/redis/features/restapi)

## 변경 파일

| 영역 | 파일 |
| --- | --- |
| 검색 화면 | mobile/src/app/places.tsx |
| 화면 상태 | mobile/src/features/places/usePlaceSearch.ts |
| 모바일 서비스 | mobile/src/services/places.ts, placesClient.ts, placeLocation.ts, placeContract.ts |
| 진입점 | mobile/src/screens/WelcomeScreen.tsx, AuthScreen.tsx, ServicesScreen.tsx, PatientHome.tsx |
| 공통 UI | mobile/src/components/ui.tsx: Action의 optional disabled 상태만 추가 |
| Expo/환경 | mobile/package.json, package-lock.json, app.json, app.config.ts, .env.example |
| Edge | supabase/functions/search-places/index.ts, handler.ts, .env.example |
| 서버 계약/설정 | supabase/functions/_shared/placeContract.ts, supabase/config.toml |
| 테스트/문서 | mobile/scripts/test-places.cjs, docs/places-search.md |

인증 서비스/컨트롤러, 로컬 데이터 보호, 보호자 권한, SQL/RLS, mobile-api, mas_project는
이번에 변경하지 않았다. 기존 작업 트리의 다른 변경은 이번 변경으로 집계하지 않는다.
앱과 서버의 순수 계약 파일은 Metro 프로젝트 바깥 경로 의존을 피하도록 복제하며,
byte-identical 테스트로 동기화를 확인한다.

## 패키지와 검증

Expo SDK 58의 bundledNativeModules 권장 버전과 공식 문서를 확인하고
expo-location ~58.0.19 하나를 Expo installer로 추가했다. background 위치 요청이나
추적은 추가하지 않았다. 기존 설치 패키지를 정리하거나 audit fix를 실행하지 않았다.
설치 요약에는 27건의 의존성 취약점이 보고됐지만 도입 전후 비교나 개별 원인 분석은
이번에 수행하지 않았다. 별도 의존성 검토가 필요하다.
[SDK 58 위치 문서](https://docs.expo.dev/versions/v58.0.0/sdk/location/)

검증 명령(mobile):

```powershell
node --test scripts/test-places.cjs scripts/test-local-data.cjs scripts/test-auth.cjs scripts/test-auth-integration.cjs scripts/test-supabase.cjs
npx.cmd --no-install tsc --noEmit
$env:EXPO_NO_DOTENV = '1'
npm.cmd run lint
```

검색 19건 + 기존 56건 = **75건 통과**, mobile TypeScript·lint 통과.
Edge handler와 공통 계약도 TypeScript strict/DOM 타입으로 검사했다.
Deno CLI가 없어 Deno 런타임·플랫폼 번들·로컬 Function 실행은 미검증이다.
실제 API·키 검증, Redis Lua 실행, 브라우저/Android 화면·권한·링크는 미실행이다.
패키지 레지스트리 설치와 공식 문서 조회 외에 업무 API 호출은 하지 않았다.

## Android 확인 절차와 다음 단계

현재 API 미설정 상태에서도 확인 가능한 항목:

1. mobile에서 `npx.cmd expo start --clear`로 실행한다. SDK 58을 지원하는 Expo Go나
   해당 SDK 개발 빌드를 사용한다. 독립 앱은 위치 plugin 적용 후 다시 빌드해야 한다.
2. 로그인 없이 시작 화면/로그인 화면의 ‘병원·약국 찾기’로 진입한다.
   가능한 경우 `mobile://places` 직접 경로도 확인한다. 기존 인증이 검색에 필요하지 않아야 한다.
3. 병원↔약국 선택, 한국어 키워드 입력, 빈 입력/1자 입력 오류를 확인한다.
   주소를 설정하지 않았다면 설정 오류가 나오고 기관 목록이 만들어지지 않아야 한다.
4. 주변 검색을 눌러 위치 권한을 거부한다. 거부 안내 뒤 키워드 입력/검색은 계속 가능해야 한다.
   위치를 허용하더라도 서버 미설정이면 위치 취득 후 설정 오류로 끝나야 한다.
5. 시스템 뒤로가기로 기존 화면에 돌아가며 인증/복약·SOS 흐름이 유지되는지 확인한다.
   검색 도중 화면을 닫거나 분류를 바꾸면 이전 결과가 뒤늦게 나타나지 않아야 한다.

API/보호 장치 준비·별도 배포 승인 뒤 확인할 항목:

1. 사용자가 직접 Kakao REST 키와 전용 Redis 환경을 준비하고 서버 Secrets에 입력한다.
   입력 값이나 대시보드 키 화면을 채팅/로그에 보내지 않는다. Kakao 앱의 Local 사용 권한·
   쿼터·사용 조건도 대시보드에서 확인한다.
2. 격리 환경에서 Lua 동시 실행/분·일·월 한도/Redis 장애 시 차단과 Edge 설정을 검증한다.
   테스트 전역 한도는 낮추고 다른 프로젝트와 카운터를 공유하지 않는다.
3. 플랫폼 비용 보호와 남용 대응을 검증할 수 없다면 공개 활성화하지 않는다.
   검증·배포는 이번 작업에서 하지 않았으며 별도 승인/작업이다.
4. 준비가 끝난 Function 주소만 mobile/.env에 입력하고 Metro를 재시작한다.
5. 병원/약국 각각 키워드·주변 검색, 0건, 거리·주소·전화 누락, 페이지 추가·재시도,
   비행기 모드, 한도 초과, 상세 링크, 위치 서비스 꺼짐, 권한 영구 거부를 확인한다.
6. 운영 전 큰 글꼴·TalkBack·작은 화면·브라우저 Origin과 HTTPS 권한도 확인한다.

RAG/AI·전체 지도·실시간 운영시간·응급실 가용 정보는 이번 범위에 포함하지 않았다.
원격 DB/Cloudtype 변경, SQL 실행, Function 배포, Git commit/push는 하지 않았다.
