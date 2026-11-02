# DrMAS-Dev 연결·검증·Preview 실행 안내

확인일: 2026-11-01 (Asia/Seoul). 아래 배포/원격 시험 명령은 안내용이다.
이번 작업에서 실행하지 않았다. 실제 키·이메일·비밀번호·JWT를 공유하지 않는다.

## 1. 먼저 확인한 사실

- 현재 앱의 필수 인증 설정은 4개이며 검색 함수 주소는 선택적인 5번째 설정이다.
- Dev target guard가 통과하지 않아 원격 배포 확인 요청은 보내지 않았다.
  `search-places`의 현재 배포 여부는 **미확인**이다. 로컬 코드가 있다고 배포된 것은 아니고,
  로컬 배포 연결 파일이 없다고 원격 미배포를 증명하는 것도 아니다.
- Supabase CLI의 전역 설치와 로컬 배포 연결 기록도 확인되지 않았다.
- 앱 코드·실제 .env·SQL·배포 설정은 수정하지 않았다. 사용자 실행용 읽기 검사와 이 문서를 추가했다.
- Kakao/Redis/Dev 로그인/RLS 실호출, SQL, Edge/Vercel 배포는 이번에 하지 않았다.

## 2. VS Code에서 mobile/.env 설정

1. VS Code에서 `파일 → 폴더 열기 → C:\MAS\Dr-mas`를 선택한다.
2. 왼쪽 탐색기에서 `mobile → .env`를 연다. 기존 값은 자동 덮어쓰지 않는다.
3. 브라우저에서 Supabase 로그인 → 프로젝트 목록 → **DrMAS-Dev**를 선택한다.
   화면 위 프로젝트 이름을 확인하고 원래 프로젝트/Cloudtype는 열지 않는다.
4. 상단 `Connect` 또는 `Project Settings → Data API`에서 Project URL을 확인한다.
   `Project Settings → API Keys`의 **Publishable key**를 사용한다.
   Project Settings의 General에서 Project ID/Reference ID도 확인한다.
   대시보드 버전에 따라 메뉴 이름이 조금 다르면 같은 항목 이름으로 찾는다.
5. 아래 이름으로 사용자가 로컬에 직접 입력하고 `Ctrl+S`로 저장한다.

| 정확한 이름 | Dev에서 입력할 내용 |
| --- | --- |
| EXPO_PUBLIC_APP_ENV | `development` |
| EXPO_PUBLIC_EXPECTED_SUPABASE_REF | DrMAS-Dev URL의 호스트 맨 앞 ref |
| EXPO_PUBLIC_SUPABASE_URL | DrMAS-Dev의 HTTPS Project URL |
| EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 같은 프로젝트의 sb_publishable 공개 키 |

APP_ENV 허용값은 소문자 `development`, `production` 두 가지다.
`dev`, `Dev`, `DrMAS-Dev`, `preview`는 허용값이 아니다.
Vercel의 Preview 환경을 써도 데이터 프로젝트가 Dev라면 `development`다.

URL 형식이 `https://<DEV_REF>.supabase.co`라면 EXPECTED_SUPABASE_REF에는
**<DEV_REF> 부분만** 넣는다. `https://`, `.supabase.co`, 경로, 따옴표/괄호를
추가로 넣지 않는다. 프로젝트 표시 이름 DrMAS-Dev도 ref가 아니다.
코드는 `URL.hostname === EXPECTED_REF + '.supabase.co'`를 비교한다.
위의 `<DEV_REF>`는 설명용 자리표시자이며 그대로 입력하지 않는다.

선택적인 5번째 이름:

`EXPO_PUBLIC_PLACES_FUNCTION_URL`

검색 함수가 배포된 뒤 그 함수의 HTTPS URL을 넣는다. 현재 코드는 정확히
`https://<DEV_REF>.supabase.co/functions/v1/search-places` 경로를 받는다.
함수 배포 전에는 비워도 되고, 이 경우 검색은 설정 안내를 표시한다.
카카오/OpenAI/Redis 비밀은 mobile/.env에 넣지 않는다.

6. VS Code `터미널 → 새 터미널`에서 실행한다.

```powershell
cd C:\MAS\Dr-mas\mobile
npm.cmd run check:public-env
```

**성공 기준:** urlValid, publicKeyFormat, environmentLabelValid,
expectedProjectMatches 모두 true이고 unsafePublicVariableNames는 빈 배열이다.
이 검사는 값·연결 성공을 출력하지 않는다. 종료 코드 0만 보지 말고 네 bool을 확인한다.
false가 있으면 설정을 고친다. URL/ref 형식만으로 공개 키의 프로젝트 소유까지
증명할 수는 없으므로 실제 로그인도 확인해야 한다.
검사 도구와 JWT 도구는 mobile/.env를 읽는다. Expo에 별도 .env.local이나 셸 환경값이
있으면 실제 앱의 우선순위가 다를 수 있으므로 중복 설정과 오래된 Metro도 확인한다.

## 3. 검색 Secrets와 Upstash 권한

Supabase **DrMAS-Dev → Edge Functions → Secrets → Add new secret**에서
Key/Value를 직접 입력하고 Save한다. 입력/갱신은 사용자 작업이며 이번에 수행하지 않았다.

필수 이름은 KAKAO_REST_API_KEY, UPSTASH_REDIS_REST_URL,
UPSTASH_REDIS_REST_TOKEN이다. `SEARCH_PUBLIC_ENABLED=false`도 저장한다.
키를 저장했다고 함수가 배포되거나 검색이 활성화되지는 않는다.

Upstash는 `Console → Redis → 해당 Dev 전용 DB → Connect → REST`에서 확인한다.
URL은 HTTPS REST endpoint이며 `redis://`/`rediss://` 주소가 아니다.
현재 코드는 `.upstash.io`의 루트 HTTPS URL만 지원한다.

- 기본 제공 **Standard token**은 쓰기 명령을 실행할 수 있다.
- **Read Only token**으로는 현재 제한기가 동작하지 않는다.
- 제한 ACL 토큰을 별도로 쓴다면 `EVAL`, `GET`, `INCR`, `EXPIRE` 및
  `drmas:places:*` 키 접근을 실제로 확인해야 한다. PING 성공만으로는 부족하다.
- Standard token은 권한이 넓으므로 Dev 전용 Redis에만 적용하고 서버 Secrets에 둔다.
  토큰 화면/명령의 Authorization 헤더를 캡처하거나 공유하지 않는다.

[Upstash 토큰 권한](https://upstash.com/docs/redis/features/restapi)

## 4. false 상태의 검증과 활성화 전 검증

| false를 유지하면서 가능 | false 상태로 확인할 수 없는 것 |
| --- | --- |
| 앱 화면·입력·위치 거부·오류 표시 | 실제 Kakao 검색 결과·키 유효성 |
| 자동 테스트의 입력/Origin/한도 모의 검증 | 실제 Redis가 Edge에서 호출되는지 |
| 배포 후 GET의 METHOD_NOT_ALLOWED 응답 | Edge→Redis→Kakao 전체 연결 |
| 허용 Origin의 정상 POST가 PUBLIC_DISABLED인지 | 동시 isolate의 제한·실제 제공자 쿼터 |
| 거부 Origin의 403, 잘못된 입력의 400/413 | 실제 검색의 거리/주소/전화/페이지 품질 |
| 부록의 Redis 직접 REST/EVAL 시험 | Edge/Redis 자체 비용의 안전 상한 |

현재 함수는 플래그를 검사한 **뒤에** 카카오 키/Redis를 읽는다. 따라서
PUBLIC_DISABLED는 키·Redis 연결이 정상이라는 뜻이 아니다.

활성화 전에: 전용 Redis·키 권한·EVAL 시험, 비용 제한/알림/중지 방법,
허용 Origin, 낮은 시험 한도, 별도 승인된 일시 Dev 활성화로 실제 200/429/Redis 장애 시
503/공급자 오류·빈 결과를 검증한다. 끝나면 false로 되돌린다.
공유 전체 한도는 사용자별 공정한 배분이 아니며 공격자가 먼저 소진할 수 있다.
CORS/Origin은 인증이 아니고 헤더 생략/위조를 막지 못한다. 준비되지 않으면 false를 유지한다.

SEARCH_ALLOWED_ORIGINS에는 `http://localhost:실제포트`와 나중의 정확한 Preview
`https://호스트`를 쉼표로 구분한다. `/places` 경로나 마지막 `/`는 넣지 않는다.
`localhost`와 `127.0.0.1`은 서로 다른 Origin이다. `*`를 인증 대용으로 쓰지 않는다.

## 5. search-places 배포 여부와 배포 명령

**먼저 확인:** Supabase → DrMAS-Dev → Edge Functions → Functions 목록.
search-places가 있으면 열어서 배포 상태/최근 배포/코드를 확인한다. 없으면 그
프로젝트에는 해당 이름으로 배포되지 않은 것이다. Secrets 목록은 배포 증거가 아니다.

CLI로 확인하려면 VS Code 터미널에서 아래만 실행한다. REF는 공개 식별자이고
키/DB 비밀번호가 아니다. `YOUR_DRMAS_DEV_REF`를 실제 Dev ref로 바꾼다.

```powershell
cd C:\MAS\Dr-mas
npx.cmd supabase@latest login
npx.cmd supabase@latest functions list --project-ref YOUR_DRMAS_DEV_REF
```

로그인은 브라우저 안내를 사용한다. 계정 토큰을 명령줄 인수나 채팅에 넣지 않는다.
새 프로젝트 생성, `supabase init`, `db push`, `db reset`, DB link는 필요하지 않다.

아래는 **별도 승인 후 실제 배포할 때만** 실행하는 명령이다. 이번에는 실행하지 않았다.

```powershell
npx.cmd supabase@latest functions deploy search-places --project-ref YOUR_DRMAS_DEV_REF --use-api
```

전제: 올바른 Dev 프로젝트에 배포할 계정 권한, 로컬 index.ts/handler.ts/_shared,
supabase/config.toml 존재, Secrets와 false 설정 확인. `--use-api`는 서버 측 번들을
사용해 Docker 없이 배포하는 옵션이다. 함수의 verify_jwt=false는 현재 config.toml에
있다. 이 검색 함수 이외 인증/RLS를 끄지 않는다. `--prune`은 쓰지 않는다.

**성공 기준:** CLI 성공 + DrMAS-Dev Functions 목록에 search-places 표시 + 배포 코드
일치. 토큰 없이 GET하면 현재 handler는 405/METHOD_NOT_ALLOWED를 반환한다.
정상 형식 POST는 false 상태에서 503/PUBLIC_DISABLED다. 401은 JWT 설정,
404는 프로젝트/ref/함수명, 403 ORIGIN_DENIED는 Origin을 먼저 확인한다.
상태 코드 하나만으로 원인을 단정하지 말고 응답의 고정 code와 배포 목록을 함께 본다.

[Supabase 배포·CLI](https://supabase.com/docs/reference/cli/supabase-functions-deploy),
[Secrets 메뉴](https://supabase.com/docs/guides/functions/secrets)

## 6. 앱 로그인과 복약 시험

기존 승인된 가상 A/B 계정만 사용한다. 실제 사람/건강정보는 입력하지 않는다.
계정이 없다면 검증용 계정 생성도 별도 사용자 작업으로 준비한다. 이메일 제한을
피하려고 운영 이메일 확인이나 RLS를 끄지 않는다.

1. Supabase DrMAS-Dev의 `Authentication → Users`에서 A/B 계정 존재를 확인한다.
   `Table Editor → profiles`에서 각각 행이 있고 role이 patient인지 확인한다.
   Table Editor의 관리자 조회는 RLS 성공 증거가 아니다.
2. VS Code에서 `mobile`로 이동해 `npx.cmd expo start --web --clear`를 실행하고
   터미널에 나온 로컬 주소를 연다. 기존 프로세스의 포트와 다를 수 있다.
3. A로 로그인한다. 환자 홈 진입·오류 없음이 성공 기준이다. PGRST205라면 반복
   가입하지 말고 Dev URL/ref·테이블·캐시를 다시 확인한다.
4. 복약 탭의 **계정에 저장한 복약**에서 `연결 확인 A`처럼 가상의 일정을 등록한다.
   이 기기의 예시 일정과 혼동하지 않는다. 이름/안내/시간만 가상 값으로 입력한다.
5. 수정 → 변경 저장 → 체크 완료/취소 → 새로고침/재로그인을 차례로 확인한다.
   복원된 제목·시간·선택 날짜 체크가 일치해야 한다. 보관/복원도 확인한다.
   보관은 삭제가 아니며 medication_records 이력을 지우지 않아야 한다.
6. A 로그아웃 후 B로 로그인한다. A 일정이 보이지 않아야 한다. B도 별도 가상 일정
   1개와 체크 기록 1개를 만든다. 새 일정 ID와 소유자는 대시보드에서 확인하되 출력/공유하지 않는다.
7. B→A로 돌아와 A 기록만 복원되는지, 채팅/SOS/비밀번호가 남지 않는지 확인한다.

## 7. 실제 JWT 읽기 RLS 시험

새 도구 `mobile/scripts/verify-dev-rls.cjs`는 실제 실행 시 A/B로 로그인해 각각의
JWT를 SDK 메모리에 유지하고 직접 조회한다. 토큰을 화면에 복사할 필요가 없다.
profiles/medications/medication_records에는 SELECT만 수행한다. Auth 로그인과
이 도구가 만든 세션의 local-scope 로그아웃은 수행한다. 파일/DB 데이터 변경은 없다.

VS Code **통합 터미널**에서 사용자가 직접 실행한다. 파이프로 입력하지 않는다.

```powershell
cd C:\MAS\Dr-mas\mobile
node scripts/verify-dev-rls.cjs --dev-readonly --synthetic-accounts-only
```

영문 안내에 A 이메일 → A 비밀번호 → B 이메일 → B 비밀번호를 입력하고 각각 Enter.
입력은 이메일을 포함해 화면에 표시되지 않는다. 정상이다. Backspace로 고칠 수 있고
Ctrl+C로 취소할 수 있다. 실제 계정은 사용하지 않는다. 값/헤더를 붙여넣은 로그를 공유하지 않는다.

**성공 기준:** own_profile, other_profile_blocked, A_cannot_read_B_existing_medication,
A_cannot_read_B_existing_record, anonymous 차단 항목이 PASS다.
fixture_missing이 UNVERIFIED면 B의 검증용 일정/체크를 준비하고 다시 실행한다.
종료 코드 0은 이 읽기 범위의 완료, 1은 실패, 2는 실행 플래그 누락,
3은 fixture 부족이다. 쓰기 RLS 전체 완료를 뜻하지 않는다.

쓰기·보호자 전체 검사는 아직 별도다. Dev의 가상 fixture로, 신뢰할 수 있는 JWT
시험 클라이언트를 사용하고 다음 결과를 추가 검증해야 한다. 앱 버튼만으로는
다른 patient_id나 role 쓰기를 시도할 수 없어 이 항목을 대체할 수 없다.

| 추가 검사 | 성공 기준 |
| --- | --- |
| A가 B 일정/기록으로 insert/upsert/update/delete 요청 | 차단 또는 변경 0건, B 재조회로 불변 확인 |
| A 자신의 role/일정 소유자 변경 | 차단, 서버 값 불변 |
| care_links 상태 직접 조작 | 차단 |
| 미승인 보호자 읽기 | 차단 |
| 환자 승인 후 보호자 읽기/쓰기 | 허용 범위 읽기만, 쓰기 차단 |
| 승인 철회 후 새 조회 | 다시 차단 |

이 원격 쓰기 시험·승인/철회는 별도 승인을 거쳐 진행한다. SQL Editor의 owner
세션을 JWT 대용으로 쓰지 않는다. 모든 원격 행렬이 끝나기 전 전체 RLS 검증 완료로
표시하지 않는다. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

## 8. Vercel Preview와 가장 짧은 URL 확보

현재 코드와 맞는 설정은 다음과 같다.

| Vercel 항목 | 값 |
| --- | --- |
| Root Directory | mobile |
| Framework Preset | Other |
| Install Command | npm ci |
| Build Command | npm run build:web |
| Output Directory | dist |
| Node.js | 24.x |

build:web가 static output을 선택한다. 기본 expo export의 server output을 단순
정적 dist로 업로드하지 않는다. `.expo/readiness-*`는 환경값 없는 검증 산출물이므로
배포에 재사용하지 않는다. Vercel 환경값을 적용해 다시 빌드한다.

**중요:** 공식 문서상 새 Vercel 프로젝트의 첫 배포는 --target=preview를 줘도
Production으로 분류된다. 이전 안내의 ‘항상 Preview부터 배포’는 새 프로젝트에는
그대로 적용할 수 없다. 첫 Production 분류 배포에는 별도 승인이 필요하다.
[Vercel 첫 배포 규칙](https://vercel.com/docs/deployments/environments)

이미 배포 이력이 있는 프로젝트가 가장 짧은 Preview 경로다.

1. Vercel 로그인 → 해당 프로젝트 → `Deployments`에서 이력 유무를 확인한다.
   이력이 없다면 첫 배포 승인 전 멈춘다. 프로젝트 생성/가져오기의 Deploy 버튼도
   실제 배포이므로 설정 확인만 하려다 누르지 않는다.
2. `Settings → Build and Deployment`에서 위 표를 확인한다.
3. `Settings → Environment Variables → Add`에서 인증 4개 공개 값을 넣고
   **Preview**를 선택한다. 환경값 APP_ENV는 development다. 검색 주소는 준비된 경우만
   추가한다. Kakao/OpenAI/Redis 비밀은 Vercel에 넣지 않는다.
4. 로컬 VS Code에서 `mobile` 폴더가 아닌 저장소 루트에서 CLI를 연결한다.

```powershell
cd C:\MAS\Dr-mas
npx.cmd vercel@latest login
npx.cmd vercel@latest link
```

Set up and deploy가 아니라 link 명령이다. 본인 Team/Scope와 기존 Dr.MAS 웹 프로젝트를
선택한다. 다른 웹서버 프로젝트를 고르지 않는다. Root Directory는 remote 설정의 mobile이다.
CLI는 저장소 루트에서 실행하므로 mobile/mobile 경로가 되지 않도록 한다.

5. 승인 후 아래를 실행하면 커밋/푸시 없이 현재 로컬 작업 내용을 업로드할 수 있다.

```powershell
npx.cmd vercel@latest deploy --target=preview
```

--prod, --public, --yes를 추가하지 않는다. 배포 대상/설정 확인을 읽고 진행한다.
첫 프로젝트는 이 명령도 Production 분류가 될 수 있으므로 1번 조건을 먼저 만족해야 한다.
새 프로젝트라면 Dev 값만 사용하는 첫 배포를 별도 승인한 뒤 이후 Preview를 만든다.
최단 URL만 필요하면 첫 Dev 전용 Production 분류 URL을 별도 승인해 받을 수도 있지만
이는 Preview라고 부르면 안 된다. `--skip-domain`도 Preview로 바꾸는 옵션은 아니다.

6. Deployments에서 Environment=Preview, 상태 Ready, View Deployment로 열린 URL을
   확인한다. Root와 /places 직접 접속·새로고침, 로그인/로그아웃·복약 저장을 검사한다.
7. Preview가 로그인 보호돼 있으면 평가자가 접근할 수 있는지 시크릿 창으로 확인한다.
   보호를 해제하거나 접근 범위를 넓히는 작업은 별도 결정/승인을 거친다.
8. 검색이 필요하면 정확한 Preview Origin을 Supabase SEARCH_ALLOWED_ORIGINS에
   추가하고 별도 활성화 시험을 진행한다. 이메일 확인을 쓸 경우 Supabase의
   `Authentication → URL Configuration`에서 승인된 사이트/redirect 주소를 준비한다.
   현재 앱은 callback 자동 세션 교환을 구현하지 않았으므로 이메일 확인 후 직접 로그인한다.

설정 변경은 새 배포에 적용한다. 캐시된 옛 빌드에 새 환경값이 자동 주입되는 것은 아니다.
[Vercel monorepo CLI](https://vercel.com/docs/monorepos),
[Preview 환경](https://vercel.com/docs/deployments/environments),
[배포 명령](https://vercel.com/docs/cli/deploy)

## 부록. Redis EVAL 권한을 키 노출 없이 직접 확인

사용자가 실행하면 **Dev Redis에 60초짜리 시험 카운터 3개를 쓴다.** 기존 제한 키나
Supabase 데이터는 건드리지 않는다. SEARCH_PUBLIC_ENABLED는 false로 유지한다.
VS Code PowerShell에 아래 코드 자체를 붙여넣고 실행한다. 실제 토큰은 코드에 적지 않고
나중의 숨김 입력에만 넣는다. -Verbose, transcript, 헤더/응답 출력은 사용하지 않는다.

```powershell
& {
  $tokenPtr = [IntPtr]::Zero
  $redisToken = $null
  $secureToken = $null
  try {
    $restUrl = Read-Host 'Dev Upstash HTTPS REST URL'
    $uri = [Uri]$restUrl
    if ($uri.Scheme -ne 'https' -or -not $uri.Host.EndsWith('.upstash.io') -or
        $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -ne '/') {
      throw 'Invalid endpoint'
    }
    $secureToken = Read-Host 'Standard REST token (hidden)' -AsSecureString
    $tokenPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $redisToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPtr)
    $source = Get-Content -LiteralPath 'C:\MAS\Dr-mas\supabase\functions\search-places\handler.ts' -Raw -Encoding UTF8
    $match = [regex]::Match($source, 'export const LIMIT_SCRIPT = `([\s\S]*?)`;')
    if (-not $match.Success) { throw 'Script not found' }
    $prefix = 'drmas:places:check:' + [Guid]::NewGuid().ToString('N')
    $command = @('EVAL', $match.Groups[1].Value, '3',
      ($prefix + ':minute'), ($prefix + ':day'), ($prefix + ':month'),
      '2', '2', '2', '60', '60', '60')
    $results = @()
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
      $response = Invoke-RestMethod -Uri $restUrl -Method Post -TimeoutSec 10 -ErrorAction Stop `
        -ContentType 'application/json' -Headers @{ Authorization = 'Bearer ' + $redisToken } `
        -Body (ConvertTo-Json -InputObject $command -Compress)
      if ($response.error -or $response.result -notin @(0, 1)) { throw 'Unexpected response' }
      $results += [int]$response.result
    }
    if (($results -join ',') -eq '1,1,0') { Write-Host 'PASS: EVAL/GET/INCR/EXPIRE and sequential quota' }
    else { Write-Host 'FAIL: quota result' }
  } catch { Write-Host 'FAIL: check endpoint, token permissions, network and script support' }
  finally {
    $redisToken = $null
    if ($tokenPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPtr) }
    if ($null -ne $secureToken) { $secureToken.Dispose() }
  }
}
```

PASS는 Standard 토큰의 실제 스크립트 실행과 순차 한도만 확인한다. Edge의 Secret
입력 일치, 동시성, 장애, 비용 보호, 카카오 연결을 대신하지 않는다. FAIL이면 원본
에러/헤더를 채팅에 붙이지 말고 토큰 종류·REST URL·네트워크부터 확인한다.

## 이번 로컬 검사 기록

읽기 검사 도구의 target/누출 탐지/fixture 부족 처리를 가상 클라이언트로 시험했다.
기존 95건과 새 2건, 총 97건 통과. TypeScript·lint 통과, PowerShell 예제 7개는
실행하지 않고 구문 분석만 해 오류 0건이었다. 실제 Redis/JWT 도구는 실행하지 않았다.
제품 소스/빌드 설정은 바꾸지 않았으므로 이번에는 웹 export를 다시 수행하지 않았다.
