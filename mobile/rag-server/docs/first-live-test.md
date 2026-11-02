# 최초 Gemini 실호출: 학교 PC용 1회 제한 테스트

## 코드 점검 결과

src/gemini.ts에 실제 Google SDK 연결이 구현되어 있습니다.
- GeminiProvider.embed: models.embedContent, gemini-embedding-001, 768차원, 문서 RETRIEVAL_DOCUMENT / 질문 RETRIEVAL_QUERY, 결과 L2 정규화.
- GeminiProvider.select: models.generateContent, GEMINI_GENERATION_MODEL, 출력 최대 1,200토큰, JSON 인용 선택 후 src/answer.ts에서 원문/출처 검증.
- 합성 로컬 자료는 rights.permission=test-only이므로 일반 live 인덱싱/답변에서는 제외합니다. 실제 테스트를 하려고 합성 문서의 권한을 permitted로 바꿀 필요가 없습니다.
- 일반 index/search/ask 명령은 여러 API 요청을 발생시킬 수 있습니다. 최초 1회 확인에는 사용하지 마세요.

## 환경변수

- GEMINI_API_KEY: 일반 엔진의 서버 전용 비밀키. 코드가 명시적으로 이 값만 사용합니다. GOOGLE_API_KEY를 추가할 필요가 없습니다.
- GEMINI_GENERATION_MODEL: 답변 생성에 사용할 공식 모델 ID. 비밀값이 아닙니다. 임베딩만 확인할 때는 필요 없습니다.
- SEARCH_MIN_KEYWORD / SEARCH_MIN_VECTOR: 선택적인 검색 임계값이며 비밀값이 아닙니다.

개인/운영 서버에서는 비밀 관리 기능으로 GEMINI_API_KEY를 프로세스에 주입하세요. 키를 앱 클라이언트·Git·명령 인자·로그에 넣지 마세요. 학교 PC에서는 .env, setx, PowerShell 프로필, IDE 설정에 저장하지 말고 아래 전용 명령을 사용하세요. CLI는 .env를 자동 로드하지 않습니다.

## 정확한 최초 실행 명령 (임베딩 1회)

```powershell
cd C:\MAS\Dr-mas\mobile\rag-server
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-secure.ps1
```

ExecutionPolicy Bypass는 이 PowerShell 프로세스에만 적용하며 시스템/사용자 정책을 저장 변경하지 않습니다. 학교가 스크립트 실행을 금지하는 경우 우회하지 말고 개인 PC에서 테스트하세요.

명령 실행 후 숨김 키 입력창에 직접 입력합니다. 실제 키를 위 명령에 붙여 넣거나 채팅으로 보내지 마세요. 전용 테스트는 GEMINI_API_KEY 환경변수도 설정하지 않고 키를 표준입력으로 Node 자식 프로세스에 전달합니다.

전송 내용은 고정된 짧은 가상 문자열 '가상성분베타'뿐입니다. 실제 환자 데이터, 로컬 의료자료, 복약기록을 읽거나 전송하지 않습니다. SDK가 단일 항목의 batchEmbedContents HTTP 요청으로 직렬화하더라도 요청/항목은 각각 1개입니다.

성공 결과 예시 (실제로 성공한 기록이 아니라 출력 형식):

```json
{"mode":"live","mock":false,"status":"embedding_success","apiCalls":1,"dimensions":768,"outputCharacters":null}
```

벡터 원본, API 키, 응답 헤더와 원시 오류는 출력하거나 저장하지 않습니다. 실패하면 NOT verified를 표시하며 성공으로 취급하지 않습니다. 오류 세부내용도 비밀 노출 방지를 위해 숨깁니다.

## 1회 제한과 비용

- 이 전용 경로의 호출 예산은 총 1회입니다. SDK/애플리케이션 자동 재시도는 모두 없으며 타임아웃·429·실패도 예산을 소비합니다.
- 호출 전 .smoke/first-attempt.json을 배타적으로 생성합니다. 같은 폴더에서 동시 실행/재실행/다른 모드 실행도 두 번째 호출을 차단합니다. 이 파일에는 시간·모드·한도만 있고 키/본문/응답은 없습니다.
- 테스트 입력은 최대 64자, 기본 임베딩은 6자입니다. HTTP/애플리케이션 타임아웃은 10초이며 부모 프로세스 대기 한도는 20초입니다.
- 원화/달러 상한을 보장하는 결제 제어는 아닙니다. 모델 단가·계정에 따라 과금되며 타임아웃 후에도 서버 처리가 과금될 수 있습니다. 별도 테스트 프로젝트의 API 할당량을 낮추고 공급자 사용량을 확인하세요. 결제 예산 알림은 차단 한도가 아닐 수 있습니다.
- 이 예산은 전용 smoke 경로에만 적용합니다. 일반 index/ask 명령, 다른 폴더/장치/키의 호출을 전역 차단하지 않습니다. 테스트 후에도 marker를 지우거나 일반 live 명령을 실행하지 마세요.

임베딩과 답변 생성을 모두 실제로 검증하려면 최소 2회가 필요하고, 문서 임베딩+질문 임베딩+생성의 RAG 흐름에는 보통 최소 3회가 필요합니다. 최초 1회 테스트는 전체 RAG 성공을 의미하지 않습니다.

아직 최초 테스트를 하지 않았고 임베딩 대신 생성만 1회 확인하려는 경우에만 다음을 선택할 수 있습니다.

```powershell
$env:GEMINI_GENERATION_MODEL = '계정에서 사용 가능한 공식 생성 모델 ID로 교체'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-secure.ps1 -Mode generation
Remove-Item Env:\GEMINI_GENERATION_MODEL
```

두 명령을 연속 실행하는 절차가 아닙니다. 두 모드는 같은 1회 예산을 공유합니다. 생성도 고정 가상자료만 보내며 출력 최대 64토큰, 본문 대신 응답 글자 수만 표시합니다. 모델 ID에 따라 64토큰으로 유효 응답이 없을 수 있으며 실패해도 재시도하지 않습니다.

## 학교 PC에서의 비밀 취급

숨김 Read-Host 입력, 키 없는 명령 이력, 키를 포함하지 않는 자식 프로세스 인자·환경, 표준입력 전달, finally의 BSTR 초기화/해제와 프로세스 종료를 사용합니다. NODE_OPTIONS/NODE_DEBUG/SSLKEYLOGFILE 및 기존 키 변수도 테스트 자식 프로세스에서 제거합니다. 프로그램은 키를 디스크에 쓰지 않습니다.

다만 Node/.NET 문자열과 SDK는 처리 중 평문 키를 메모리에 보유합니다. 참조 해제는 모든 복사본의 즉시 소거를 보장하지 않습니다. OS 페이지파일·메모리 덤프·관리 소프트웨어·악성코드까지 포함한 '디스크 흔적 0'은 보장할 수 없습니다. 녹화/전사 중인 터미널을 피하고 가능한 한 직접 입력하세요. 클립보드를 사용했다면 기록/동기화에 남을 수 있습니다.

가장 안전한 선택은 신뢰하는 개인 PC입니다. 학교 PC에서 꼭 확인한다면 별도 제한된 테스트용 키만 사용하고, 완료 후 신뢰하는 개인 기기에서 그 키를 폐기/교체하고 사용량을 확인하세요. 공유 PC에서 브라우저로 키를 만들고 로그인 상태를 남기지 마세요.

## 모의 검증과 실제 검증의 구분

- npm-local.cmd test: 실제 SDK의 HTTP 통신을 가로챈 모의 응답을 포함하며 인터넷 Gemini API는 호출하지 않습니다. 테스트 통과는 실호출 성공이 아닙니다.
- 일반 로컬 ask: mock:true, vectorScore:null은 키워드 검색 결과입니다.
- 위 전용 명령: 실제 네트워크 응답을 검증한 경우에만 mode:live, mock:false, embedding_success 또는 generation_success를 출력합니다.
- 이번 개발 작업에서는 실제 API 키를 입력받거나 실제 Gemini 요청을 보내지 않았습니다.

공식 자료: https://ai.google.dev/gemini-api/docs/api-key , https://ai.google.dev/gemini-api/docs/embeddings , https://ai.google.dev/gemini-api/docs/models , https://ai.google.dev/gemini-api/docs/pricing . 확인일 2026-11-02.
