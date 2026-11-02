# 합성 문서의 실제 Gemini 의미 검색 테스트

이번 단계는 기존 LocalRepository → register → indexDocuments → GeminiProvider → SearchIndex 경로를 연결하여 검색만 검증합니다. 답변 생성 API는 호출하지 않습니다. 기존 1회 임베딩 smoke 테스트와는 별도의 명시적 승인 예산입니다. 이전 .smoke/first-attempt.json과 data/local은 수정하지 않습니다.

## 준비된 합성 시나리오

원본: src/semantic-trial.ts. 모든 자료는 직접 작성한 합성 자료이며 의료적 사실/권고의 근거가 아닙니다.

| 구분 | 내용 |
|---|---|
| 문서 semantic-rest | 야간 수면과 규칙적인 취침 환경에 관한 합성 문서 |
| 문서 semantic-activity | 걷기와 신체 운동에 관한 합성 문서 (구별용) |
| 질문 | 잠들기가 힘들어요 |
| 기대 문서 | semantic-rest |

키워드 전용 검색은 위 질문에 insufficient_evidence를 반환해야 합니다. 질문의 검색 토큰과 문서 제목/본문에 부분 문자열 일치가 있는지도 기존 검색기로 사전 검사합니다. '어떤 단어도 같다'는 일반 언어학적 주장이 아니라 현재 토큰/부분문자열 검색 규칙에서 keywordScore=0이라는 뜻입니다.

모의 Provider는 목표 문서와 질문에 같은 벡터, 구별용 문서에 직교 벡터를 반환합니다. 따라서 모의 통과는 파이프라인 검증이며 Gemini가 동의어 의미를 이해한다는 실증이 아닙니다.

## 먼저 모의 실행

```powershell
cd C:\MAS\Dr-mas\mobile\rag-server
.\npm-local.cmd run semantic:mock
```

mock:true, actualEmbeddingCalls:0, mockEmbeddingCalls:3, semantic_search_success가 정상입니다. 키워드 전용 검색 결과와 검색된 각 문서의 keywordScore/vectorScore/합산 score를 구분해서 출력합니다.

## 승인한 경우에만 실제 실행

```powershell
cd C:\MAS\Dr-mas\mobile\rag-server
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\semantic-secure.ps1 -ApproveLive
```

-ApproveLive는 이 합성 시나리오에 한해 문서 임베딩 2회+질문 임베딩 1회, 최대 3회의 새 실호출을 승인한다는 뜻입니다. 스크립트가 모의 검색 성공을 다시 확인한 후 키를 숨김 입력받습니다. 학교 정책이 스크립트 실행을 금지하면 우회하지 말고 개인 PC를 사용하세요. ExecutionPolicy 옵션은 해당 프로세스에만 적용됩니다.

키를 채팅·코드·명령 인자·.env·IDE·setx에 넣지 마세요. 키는 숨김 입력→표준입력으로만 전달하며 프로그램이 파일/로그에 저장하지 않습니다. 자식 프로세스에서는 기존 키 환경변수와 Node 디버깅 옵션을 제거합니다. 평문 키의 메모리 처리와 OS 페이지파일/덤프까지 완전히 통제할 수는 없으므로 학교 PC에서는 제한된 테스트 키를 사용하고 완료 후 개인 기기에서 폐기하세요.

## 설정과 격리

- 문서/질문 모델: gemini-embedding-001. 공통 차원 768, 공통 모델/차원/프로필 사용.
- 문서 태스크 RETRIEVAL_DOCUMENT, 질문 태스크 RETRIEVAL_QUERY. 질문은 normalize 후 임베딩합니다.
- 두 벡터 모두 L2 정규화 후 코사인 유사도로 비교합니다. 모델/차원/전처리 프로필이 다른 벡터는 섞지 않습니다.
- 기존 생성 답변 경로는 test-only 문서를 계속 제외합니다. 일반 인덱싱도 기본적으로 test-only를 제외합니다.
- 이 전용 시험만 ID+본문 SHA256이 고정 시나리오와 일치하는 test-only 문서를 명시적으로 허용합니다. 권한 메타데이터를 permitted로 바꾸지 않습니다.
- 실제 상태·벡터·사용량·예약·결과는 data/semantic-live/에만 저장합니다. 합성 본문과 벡터가 저장되지만 키는 저장하지 않습니다. data는 Git 제외 경로입니다. 모의 실행은 메모리 저장소만 사용합니다.

## 호출·비용 한도

- 총 3회, 입력 총 512자 이하, 동시 1개, 1.1초 간격, 시도당 10초 타임아웃.
- SDK와 애플리케이션 모두 재시도 없음. 실패도 예산을 소비하고 추가 시도하지 않습니다.
- 최초 호출 전에 data/semantic-live/attempt.json을 배타적으로 생성합니다. 동시 실행과 재실행은 차단됩니다. 일반 상태에도 매 호출을 먼저 예약합니다. 기존 marker를 지워 재시도하지 마세요.
- 예상 입력비 한도 USD 0.001을 사전 검사합니다. 2026-11-02 공식 일반 임베딩 입력 단가 $0.15/백만 토큰, 모델 입력 상한 2048토큰/회, 3회라는 보수적인 가정으로 $0.0009216을 계산합니다. 실제 짧은 합성 입력은 이 상한보다 작습니다. 추가 countTokens/생성 API는 호출하지 않습니다.
- 단가 가정에 근거한 예상 비용 제한이지 공급자의 실제 결제 차단 기능이 아닙니다. 단가·계정 조건 변경과 타임아웃 과금을 보장 통제하지 못합니다. 전용 키/프로젝트의 낮은 공급자 할당량과 사용량도 확인하세요. SDK가 내부적으로 batchEmbedContents로 직렬화해도 각 HTTP 요청에 항목은 하나이며 비동기 할인 Batch API 사용을 뜻하지 않습니다.
- 이 3회 제한은 전용 시험 경로에 적용됩니다. 일반 index/ask 또는 다른 복사본/키의 호출을 전역 차단하지 않습니다.

## 결과 판정

실제 호출이 모두 끝나면 mode:live, mock:false, actualEmbeddingCalls:3과 함께 점수를 출력합니다. 결과는 data/semantic-live/result.json에도 저장합니다.

semantic_search_success는 목표 문서가 최상위이며 keywordScore=0이고 vectorScore가 시험 임계값 0.5 이상일 때만 표시됩니다. 임계값 0.5는 합성 시험용 임시값으로 production 기본값을 바꾸거나 의료 검색 정확성을 보증하지 않습니다. thresholdCalibrated:false를 출력합니다. 임계값 미달 또는 잘못된 순위는 semantic_search_not_verified로 기록하고 전체 후보 rankings도 남깁니다. 점수를 보고 임계값을 임의로 내려 성공으로 바꾸지 마세요.

모델/API 오류나 타임아웃이면 not_verified로 끝나고 재시도하지 않습니다. 일부 호출 후 실패했을 수 있으므로 실제 호출 수를 성공으로 추정하지 않습니다. 상태의 usage.calls는 성공 수가 아니라 예약/시도 수입니다.

이전 사용자가 보고한 embedding_success는 단일 임베딩 연결 성공입니다. 이번 구현 작업에서 실행한 것은 모의 시험이며 실제 문서 의미 검색의 성공을 보고한 것이 아닙니다. 실제 결과는 위 승인 명령을 실행한 후 확인해야 합니다.

공식 문서: https://ai.google.dev/gemini-api/docs/embeddings (태스크·차원·정규화), https://ai.google.dev/gemini-api/docs/pricing (단가). 확인일: 2026-11-02.
