# Dr.MAS medical information RAG server

기존 모바일 앱과 별개로 실행하는 Node.js 24 LTS / TypeScript 서버 모듈입니다. 이 변경은 `mobile/rag-server/`만 추가하며 모바일 소스·설정·Supabase·Vercel과 연결하거나 배포하지 않습니다.

## 설치와 검사

```powershell
cd C:\MAS\Dr-mas\mobile\rag-server
npm ci
npm run lint
npm run check
npm test
npm run quality:mock
npm run semantic:mock
```

Node.js 24 LTS를 PATH에 설치하세요. npm-local.cmd도 PATH의 Node/npm을 사용합니다. 학교 컴퓨터의 portable 런타임, node_modules, .env, 임베딩/문서 저장소와 보고서 로그는 저장소에 포함하지 않았습니다. 의존성은 이 폴더에서만 설치합니다.

`lint`는 TypeScript의 unused-local/parameter 검사를 사용하는 정적 검사이며 별도 Expo lint를 실행하지 않습니다. `check`는 전체 서버 타입 검사입니다. 테스트와 모의 평가에는 실제 Gemini 요청이나 키가 필요 없습니다. PowerShell 7이 설치되지 않은 PC에서는 해당 왕복 테스트 1개가 건너뛰어집니다.

## 기능과 현재 범위

- 문서 등록·UTF-8 검증·분할·중복/변경 감지·버전·삭제 및 로컬 JSON 저장소.
- Gemini 문서/질문 임베딩, 코사인·키워드 검색, 콘텐츠 캐시·예산·타임아웃·재시도.
- 원문 인용 검증·출처 매핑·근거 부족 보류·기본 의료 안전 분기.
- 합성 평가 데이터, Precision/Recall/MRR·출처 일치·보류 평가 및 UTF-8/PowerShell 진단.

자유로운 의료 설명 생성, 실제 의료 품질 보증, pgvector 구현, 인증 HTTP 서버, 앱 연결과 운영 배포는 포함하지 않습니다. 실제로 보정되지 않은 벡터 전용 검색은 답변 생성을 보류합니다. 모의 점수로 산출한 지표는 Gemini/의료 정확성을 뜻하지 않습니다.

## 구조

`src/` 엔진·CLI·평가, `test/` 합성 자동 테스트, `examples/` 합성 문서/질문, `scripts/` UTF-8 실행/키 숨김 입력, `docs/` 자료 등록·실호출·통합 설계입니다. `reports/`에는 빈 폴더 보존 파일만 포함하며 이후 생성 결과는 Git에서 제외합니다.

## 실행과 자료 등록

```powershell
npm run cli -- import examples/synthetic.json
npm run cli -- ask "가상성분베타"
npm run eval -- examples/questions.json
```

실제 자료는 이용·외부 AI 전송 권한을 확인한 공개자료만 별도로 등록하세요. 환자 개인정보·진료/개인 복약 기록을 입력하지 마세요. 합성 자료의 `test-only` 표시는 실제 의료 근거로 승격하지 않습니다. [등록 안내](docs/ingestion.md)를 확인하세요.

서버용 비밀 이름은 `GEMINI_API_KEY`, 생성 모델 ID 설정은 `GEMINI_GENERATION_MODEL`입니다. `.env.example`에는 빈 변수만 있습니다. 실제 키를 파일·로그·Git에 저장하거나 모바일 클라이언트에 전달하지 마세요. 이번 저장소 추가 작업에서는 실제 API를 호출하지 않습니다.

공유 PC에서 실행할 경우 [최초 단일 호출](docs/first-live-test.md), [승인된 소규모 의미 검색](docs/semantic-test.md) 문서를 확인하세요. 키 없는 모의 평가가 기본이며 실제 시험은 명시적 승인 스위치와 제한을 요구합니다. OS 메모리 덤프/페이지파일까지 비밀 흔적이 없다고 보장하지는 않습니다.

[인코딩·검색 품질](docs/encoding-and-quality.md), [통합 설계](docs/integration.md), [이 브랜치의 범위와 집 PC 통합](docs/repository-integration.md)도 참고하세요.
