# e약은요 최초 소량 수집 준비 및 실행 절차

확인일: 2026-11-02. **현재 실제 공공 API 요청 0회, 실제 Gemini 요청 0회**입니다. 아래 성공 응답은 예상 형식이며 실제 수집 성공을 의미하지 않습니다.

## 재확인한 공식 명세

근거: [공공데이터포털 e약은요 상세 명세](https://www.data.go.kr/tcs/dss/selectApiDataDetailView.do?publicDataPk=15075057).

- REST 요청 주소: `https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList`. 구현은 GET으로 호출합니다.
- 인증: 필수 쿼리 변수 `ServiceKey`. 포털에서 받은 **디코딩된** 값을 서버 환경변수 `DATA_GO_KR_SERVICE_KEY`로 설정하고 URLSearchParams가 한 번 인코딩합니다. OAuth/Bearer 헤더 인증으로 대체하지 않습니다.
- 페이지 변수: `pageNo`, `numOfRows`. 최초 수집은 각각 **1, 5**로 고정합니다. `type=json`으로 요청합니다. 기본 응답 형식은 XML이며 JSON도 지원합니다.
- 선택 필터: `entpName`, `itemName`, `itemSeq`, `efcyQesitm`, `useMethodQesitm`, `atpnWarnQesitm`, `atpnQesitm`, `intrcQesitm`, `seQesitm`, `depositMethodQesitm`, `openDe`, `updateDe`. 최초 명령은 임의 필터·페이지·건수 옵션을 제공하지 않습니다.
- 응답 항목: `resultCode`, `resultMsg`, `pageNo`, `numOfRows`, `totalCount`, 위 제품/문항/날짜 필드와 `itemImage`. 성공 코드 `00`을 검사합니다. Mock에서 지원하던 `header/body` 및 `response.header/body` 봉투를 그대로 사용합니다. 실제 봉투 호환성은 최초 승인 요청에서 확인해야 합니다.
- 이용 조건: 무료, 실시간 갱신, 이용허락범위 제한 없음으로 표시되어 있습니다. 개발단계 자동승인, 운영단계 심의승인, 개발계정 트래픽 10,000으로 안내되어 있습니다. 실제 계정의 승인·유효기간·남은 할당량은 이 공개 페이지로 확인할 수 없습니다.

| 공식 오류 코드 | 의미 요약 | 최초 수집기의 처리 |
|---|---|---|
| 01 | 서비스 내부 오류 | 제한 내 재시도 |
| 04 | HTTP 요청/연계 오류 | 중단 |
| 05 | 서비스 연결/응답 시간 초과 | 제한 내 재시도 |
| 10 | 요청 파라미터 오류 | 중단 |
| 12 | 서비스 없음/폐기 | 중단 |
| 20 | 인증키 누락/권한 거부 | 중단, 승인 상태 확인 |
| 22 | 일일 호출량 초과 | 중단 |
| 23 | 초당 호출량 초과 | 제한 내 재시도 |
| 29 | IP 접근 차단 | 중단 |
| 30 | 미등록 인증키 | 중단 |
| 31 | 인증키 만료 | 중단 |

게이트웨이가 JSON 요청에도 XML 오류를 반환할 수 있어 `<returnReasonCode>` 또는 `<resultCode>`의 숫자 코드만 추출합니다. 외부 엔티티를 실행하는 XML 파서는 사용하지 않습니다. `resultMsg`, 게이트웨이 원문, 요청 URL, 헤더 및 예외 cause는 출력하지 않습니다. 알 수 없는 코드·봉투는 성공으로 간주하지 않습니다.

## 실행 전 사용자 승인 사항

1. 공공데이터포털에서 e약은요 **활용신청이 승인 상태**인지, 해당 키의 이용기간과 계정 트래픽에 문제가 없는지 직접 확인합니다. `--portal-approved`는 사용자가 이를 확인했다는 표시이며, 시스템이 포털 계정 상태를 조회했다는 뜻은 아닙니다.
2. 서버 비밀 환경변수에 키를 설정합니다. 아래 PowerShell 스크립트는 키를 숨겨 입력받아 자식 프로세스의 `DATA_GO_KR_SERVICE_KEY`로만 전달합니다. 채팅, 명령행 인자, Git, 모바일 `EXPO_PUBLIC_*` 변수에는 키를 넣지 않습니다. 프로그램은 `.env`를 자동 로드하지 않습니다.
3. 다음 범위를 명시적으로 승인합니다: **페이지 1, 최대 5건, 최대 3회 HTTP 시도(최초 요청 1회 + 재시도 최대 2회), 원본/정제/RAG 로컬 저장, 권한 pending 유지, Gemini 호출 없음**. 재시도도 동일 페이지 5건만 요청합니다. 실패한 시도 역시 포털 할당량에 포함될 수 있습니다. 서버 데이터가 재시도 사이 바뀔 수 있으나 성공한 최종 응답 한 페이지만 저장하며 최대 5개 품목을 넘기지 않습니다.

이번 개발 요청은 준비 작업에 대한 승인입니다. 위 범위의 실제 호출을 승인받기 전에는 `collect`를 실행하지 않습니다. 별도의 1건 키 테스트를 추가로 호출하지 않고, 승인된 최초 요청의 성공/인증 오류로 실제 접근 가능 여부를 함께 검증합니다.

## 실행 명령

PowerShell 작업 경로:

```powershell
Set-Location C:\MAS\Dr-mas\mobile\rag-server
```

**네트워크 없는 준비 검사** (언제든 실행 가능):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\mfds-pilot.ps1 -Preflight
```

출력은 `networkRequests: 0`, `keyConfigured: true/false`, `portalApproval: "not_verified"`, `keyValidity: "not_verified"`, 최대 건수와 정책뿐입니다. 키가 있다고 유효하다고 판단하지 않습니다. 키 값·길이·일부 문자열도 표시하지 않습니다.

**사용자가 직접 실행하는 최초 수집:**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\mfds-pilot.ps1
```

스크립트는 요청 범위와 pending·Gemini 미사용을 안내하고 `COLLECT 5`를 정확히 입력한 경우에만 계속합니다. 그 외 입력은 인증키도 묻지 않고 종료합니다. 이후 포털의 **디코딩된 키**를 숨김 입력으로 받습니다. URL 인코딩된 키를 그대로 입력하면 이중 인코딩되므로 사용하지 않습니다. 실제 요청은 사용자가 이 명령을 실행하고 확인 문구와 키를 입력했을 때만 수행됩니다.

키를 명령행이나 파일에 저장하지 않습니다. BSTR 임시 버퍼는 해제하며 `finally`에서 이전 프로세스 환경값·현재 디렉터리·콘솔 인코딩을 복원합니다. 자식 Node 실행 중에는 `NODE_DEBUG`, `NODE_DEBUG_NATIVE`, `NODE_OPTIONS`를 비워 URL 추적이나 추가 로더 설정을 상속하지 않습니다. 프로세스 메모리에서 모든 문자열이 즉시 제거된다는 보장은 하지 않습니다. `-ExecutionPolicy Bypass`는 이번 새 PowerShell 프로세스에만 적용되며 시스템 정책을 변경하지 않습니다.

직접 서버 환경변수를 주입하는 운영자용 기존 CLI도 유지합니다. 아래 명령 자체가 실제 호출 승인 표시이므로 확인 프롬프트가 필요한 최초 테스트는 위 PowerShell 스크립트를 사용하세요.

```powershell
npm.cmd run mfds:pilot -- collect --approve-live-max-5 --portal-approved
```

두 플래그가 모두 필요합니다. 키 인자를 받지 않습니다. `--rows`, `--page`, `--maxPages`, 임의 저장 경로, 추가 옵션은 거부합니다. 승인이나 키가 없으면 네트워크 요청 전에 중단합니다. CLI의 디렉터리는 소스 파일 위치 기준 `mobile/rag-server/data/mfds-pilot/`로 고정되어 있어 실행 cwd를 바꿔도 새 수집으로 우회하지 않습니다.

**수집 후 네트워크 없는 원문 대조:**

```powershell
npm.cmd run mfds:pilot -- verify
```

실제 API의 키 유효성은 `collect`가 `resultCode=00`을 받고 응답 검증까지 완료했을 때 해당 요청 시점에 한해 확인됩니다. 향후 만료·권한 변경은 보장하지 않습니다. 데이터가 0건이면 성공 접근과 실제 자료 확보 여부를 구분하고, 추가 요청 없이 원인을 검토합니다.

## 요청 제한과 비밀값 보호

- 시도당 제한 시간 **10초**: fetch뿐 아니라 본문 스트림 수신까지 포함합니다. 본문 최대 **2,000,000바이트**, 최대 품목 **5개**, 페이지 **1**을 검사합니다. 제한 초과 결과를 잘라 정상 자료처럼 저장하지 않습니다.
- 총 시도 최대 **3회**, 시작 간 최소 **1.1초**, 제한된 지수 백오프를 함께 적용합니다. HTTP 429/5xx와 위 표의 일시 오류만 재시도합니다. 네트워크 오류, 클라이언트 타임아웃, 취소, 인증/일일 한도/입력 오류는 자동 재시도하지 않습니다. 서버의 긴 Retry-After에 따른 자동 예약 실행 기능은 없습니다.
- 리다이렉트는 `redirect: error`로 차단합니다. 인증키가 포함된 URL이 다른 호스트로 전달되지 않습니다. 엔드포인트와 필터가 고정되어 있습니다.
- 공식 인증 규격상 HTTPS 요청 쿼리에는 키가 필수입니다. 애플리케이션의 출력·저장 URL에는 키를 넣지 않고, fetch 호출 내부에서만 사용합니다. 외부 HTTP 추적/프록시 로깅을 별도 설정하는 경우에도 쿼리를 기록하지 않도록 관리해야 합니다.
- 응답에 키의 원문 또는 일반적인 URL 인코딩 형태가 반사되면 저장 전에 차단합니다. 보안상 오류 응답 원문을 파일에 보관하지 않습니다. 안전한 `MFDS_API_30`, `MFDS_TIMEOUT` 등의 코드만 출력합니다.
- 요청 전에 `reservation.json`을 배타 생성하고 동기화합니다. 성공·실패·타임아웃·프로세스 중단 뒤에도 남겨 두어 **재실행은 추가 요청 없이 차단**합니다. 자동 초기화 기능은 없습니다. 파일을 지워 재시도하지 말고, 재승인·실패 원인 검토를 후속 작업으로 처리합니다. 예약 파일이 존재하지만 요청 전 중단되었을 가능성도 보수적으로 차단합니다.
- 수집·RAG 저장소를 기존 데이터와 격리합니다. 처음부터 비어 있어야 하며 기존 자료의 외부 전송 권한을 승격하지 않습니다.

## 예상 응답과 저장 결과

아래 JSON은 일부 필드를 생략한 **형식 예시**입니다. 실제 품목·건수는 요청 시점에 결정됩니다.

```json
{
  "header": { "resultCode": "00", "resultMsg": "NORMAL SERVICE" },
  "body": {
    "pageNo": 1,
    "numOfRows": 5,
    "totalCount": 123,
    "items": [{ "itemSeq": "품목기준코드", "itemName": "제품명" }]
  }
}
```

수집기의 성공 출력 예시(상세 검증 목록 생략):

```json
{
  "status": "pilot_completed",
  "apiAccess": "confirmed_at_request_time",
  "attempts": 1,
  "scopeCompleted": true,
  "sourceExhausted": false,
  "verification": {
    "status": "verified",
    "items": 5,
    "permission": "pending",
    "externalCalls": 0
  }
}
```

`scopeCompleted`는 이번 5건 범위의 완료입니다. `sourceExhausted: false`라도 다음 페이지를 요청하지 않습니다. `verification.externalCalls`는 **RAG 저장소가 기록한 Gemini 호출 수**이며, 식약처 HTTP 시도 수는 별도의 `attempts`입니다.

저장 경로(기존 `.gitignore`의 `data/` 아래):

- `reservation.json`: 키 없는 승인 범위·사용 예약 기록.
- `ingestion/state.json`: 원본 UTF-8 JSON 텍스트와 정제 품목·수집일·갱신일·출처·체크포인트.
- `rag/state.json`: 동일 정제 품목에서 생성한 RAG 문서·청크. `rights.permission=pending`.
- `result.json`: 성공한 경우 원문 SHA-256, 품목별 필드 일치 수, 한국어 음절 수, HTML 포함 필드 수 등의 검증 결과.
- `verification-report.json`: 품목별 의약품명·식별자·출처·수집일과 10개 필드의 원문/정제문/일치 여부를 담은 대조 보고서.
- `verification-report.html`: 같은 대조 결과를 나란히 보여주는 UTF-8 한국어 보고서. 원문 HTML은 이스케이프하여 문자로만 표시하고 외부 자원·스크립트를 사용하지 않습니다. 성공 시 자동 생성하며 `verify` 명령은 네트워크 없이 다시 생성합니다.
- `failure.json`: 실패한 경우 안전한 오류 코드·HTTP 시도 수. 요청/원격 오류 원문은 없음.

## 검증 기준

보고서 schema 2부터 `rawRows`(원본 행 수), `uniqueItems`(고유 품목 수), `duplicateRows`(초과 중복 행 수)를 분리합니다. 기존 `items`는 `uniqueItems`와 같습니다. `records`와 `comparisons`는 원본 행 단위이며 각 기록의 `rawRow`로 연결됩니다. 같은 품목코드가 이미지 메타데이터 등의 차이로 여러 원본 행에 나타나도 정제 저장소는 품목코드 기준으로 병합합니다. `duplicates`에 원본 행 번호·상이한 필드·정제 값 동일 여부를 기록합니다. `emptyFieldDetails`와 대조 필드의 `rawStatus`는 누락, null, 빈 문자열, 공백, 정제 후 빈 값, 제공 값을 구분합니다. `fieldsMatched`에는 null 일치도 포함되고 `populatedFieldsMatched`는 값이 있는 필드의 대조 성공 수입니다.

1. `resultCode=00`, 페이지 1, 요청 크기 5와 일치하며 `items` 길이가 5 이하이어야 합니다. `totalCount` 기준 기대 건수와도 일치해야 합니다.
2. 수신한 원본 JSON은 UTF-8 fatal 디코더로 읽고 **원문 문자열 그대로** 보존합니다. 잘못된 UTF-8, 대체문자, 제어문자, 손상된 서로게이트 등은 기존 검증기로 거부합니다. 명시된 charset이 UTF-8이 아니면 거부합니다.
3. 원본 해시와 품목 코드별 연결을 검사합니다. 의약품명·품목코드·업체명·효능·사용법·경고·주의사항·부작용·상호작용·보관방법 **10개 필드**가 각 원본 필드의 정해진 정제 결과와 동일해야 합니다. 원문의 모든 내용과 미매핑 필드는 원본 JSON에 남깁니다.
4. HTML 태그 제거, 지원 엔티티 해석, NFC 및 공백 정리가 허용되는 차이입니다. 요약·번역·성분 추정은 하지 않습니다. 예: `<p>주의 &amp; 안내</p>` → `주의 & 안내`. `<` 같은 정상 일반문자는 텍스트로 보존합니다.
5. 날짜·기관·출처·수집일도 원본에서 동일 경로로 재계산하여 비교합니다. 누락 성분은 null입니다. 한국어 음절 수와 HTML 포함 필드 수는 점검 지표이며, HTML이 없는 응답도 정상일 수 있습니다.
6. RAG 문서 본문·제목·출처·본문 해시를 대조하고 모든 문서가 pending인지, 벡터가 0개이고 Gemini 사용량이 0인지 검사합니다. 이용 조건 및 외부 전송 검토 없이 `permitted`로 변경하지 않습니다.
7. Mock HTTP 회귀 테스트는 위 기준의 **독립적으로 작성한 예상 한국어 문장**과 비교하고, 저장된 각 주요 필드를 일부러 바꿔 오프라인 검증기가 불일치를 탐지하는지 확인합니다. 이것이 실제 서버에서 한국어/HTML이 검증되었다는 뜻은 아닙니다. 실제 결과 검증은 승인 후 위 `verify` 명령으로 수행합니다.

현재 지원하는 HTML 정제 범위는 기존 수집기와 동일합니다. 임의 HTML의 전체 브라우저 엔티티 규격을 구현하지 않았으며, 실제 샘플에서 추가 패턴이 발견되면 원본을 보존한 상태로 검토해야 합니다. 네트워크나 형식 검증에 실패한 페이지는 RAG에 등록하지 않습니다. RAG 저장 중 실패하면 이미 등록된 일부 자료와 대기열은 보존될 수 있으나 pending 상태이며 자동 추가 호출을 하지 않습니다. 예약 파일을 유지한 채 후속 복구 작업이 필요합니다.

## 개발 검증 결과

`npm.cmd test`: **총 67개, 통과 66개, 실패 0개, 건너뜀 1개**(PowerShell 7 미설치). 후속 오프라인 검증에서 중복 집계·빈 필드 상태·청크 무결성 테스트 3개를 추가했습니다.
`npm.cmd run check` 및 `npm.cmd run lint` 모두 통과했습니다. 사용자는 활용신청 승인을 받았다고 알려 주었으며, 실제 키 유효성과 수집 결과는 아직 검증하지 않았습니다.
HTTP 테스트는 주입한 Mock fetch만 사용합니다. PowerShell의 취소·숨김 입력·실패 후 환경 복원·준비 검사 테스트 4개는 Read-Host와 Node 명령을 모두 Mock으로 대체합니다. 보고서 원문/정제 데이터 일치와 원문 script 태그 비실행도 검증합니다. 기존 테스트의 Gemini SDK도 Mock 전송으로 검증합니다. 실제 키를 테스트 fixture나 로그에 기록하지 않습니다.

제품 허가정보 API는 이번 범위에 포함되지 않으며, 공식 상세 명세 확보 전 차단 상태를 유지합니다.
