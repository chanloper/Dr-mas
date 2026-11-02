# 식약처 공식 의약품 수집

확인일: 2026-11-02. 실제 공공 API 및 Gemini 호출 없이 구현·검증했습니다.

후속 구현: 승인 후 최대 5건을 요청하는 HTTP 어댑터·제한·검증 명령을 추가했습니다. 최신 실제 연동 절차는 [최초 소량 수집 준비 문서](mfds-live-pilot.md)를 따릅니다. 아래 전송 함수가 없다는 설명과 최초 52개 테스트 결과는 Mock 파이프라인을 처음 구축했을 때의 기록입니다.

## 공식 명세 확인 결과

- [e약은요 공식 명세](https://www.data.go.kr/tcs/dss/selectApiDataDetailView.do?publicDataPk=15075057): REST, XML/JSON. 공식 요청 주소는 `https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList`.
  GET 요청 구성을 제공하지만 전송 함수는 없습니다. `ServiceKey` 필수, `pageNo`, `numOfRows`, `type=json`을 사용합니다. 필터는 업체·제품·품목코드, 각 문항, 공개일·수정일을 공식 영문 필드명으로 제한합니다. 공식 표의 페이지 크기는 3자리이며 구현은 운영상 1~100으로 제한합니다.
- [제품 허가정보 공식 페이지](https://www.data.go.kr/tcs/dss/selectApiDataDetailView.do?publicDataPk=15095677): 품목·주성분·허가 상세 정보를 제공한다는 설명은 확인했습니다. 현재 공개 페이지의 동적 Swagger에서 요청 주소, 오퍼레이션 버전, 필수 변수, 응답 필드 표를 확보하지 못했습니다. 따라서 엔드포인트·필드 매핑을 구현하지 않았습니다. `approvalAdapter()`는 `OFFICIAL_APPROVAL_SPEC_REQUIRED`로 실패합니다. 비공식 저장소의 주소는 구현 근거로 사용하지 않았습니다.
- 두 페이지에 재사용 범위 제한 없음이 표시되어 있습니다. 이것만으로 외부 Gemini 전송에 관한 운영 검토가 완료되었다고 처리하지 않습니다. 전송 권한·약관·기관별 조건 확인 기록은 별도 준비가 필요합니다.

## e약은요 필드 매핑

| 제공 필드 | 정제 필드 |
|---|---|
| itemSeq / itemName / entpName | itemId / name / manufacturer |
| efcyQesitm / useMethodQesitm | efficacy / usage |
| atpnWarnQesitm / atpnQesitm | warning / precaution |
| seQesitm / intrcQesitm | adverseEffects / interaction |
| depositMethodQesitm | storage |
| openDe / updateDe | publishedAt / updatedAt |

성분은 이 API에 독립 필드가 없으므로 `ingredient=null`입니다. 제품명에서 추론하지 않습니다. `itemImage` 등 미매핑 필드도 원본 응답에 보존합니다. 출처 URL은 공식 데이터셋 URL에 품목 식별 fragment를 붙인 내부 출처 표기이며, 품목 상세 페이지 주소라는 의미가 아닙니다. 갱신일 누락은 null이며 수집일로 대체하지 않습니다.

## 사용 구조 (서버 TypeScript)

```ts
import { LocalRepository } from './src/repository.js';
import { easyAdapter } from './src/ingestion/mfds.js';
import { collect, lookupMedicines } from './src/ingestion/pipeline.js';
import { readFile } from 'node:fs/promises';

const ingestion = new LocalRepository('data/official-ingestion');
const rag = new LocalRepository('data/official-rag');
// 승인된 네트워크 전송 대신 로컬 Mock JSON 파일만 사용합니다.
const adapter = easyAdapter((page, rows) => readFile(`fixtures/page-${page}-${rows}.json`));
await collect(ingestion, rag, adapter, {
  jobId: 'mock-snapshot-001', rows: 100, maxPages: 2,
});
const result = await lookupMedicines(ingestion, { itemId: '1001' });
```

실행 가능한 전체 Mock 입력과 호출 예제는 `test/ingestion.test.ts`에 있습니다. 위 파일 경로는 설명용이며 공식 원본 또는 인증키를 포함한 fixture를 커밋하면 안 됩니다.

- 수집 저장소와 RAG 저장소는 **서로 다른 디렉터리**여야 합니다. 동일 저장소로 구성하면 쓰기 잠금이 충돌합니다.
- `SourceAdapter`는 소스 ID·변환 버전·페이지 로더·응답 파서·변환기를 분리합니다. 허가정보 명세를 확보하면 검증된 별도 어댑터를 추가할 수 있습니다. `Medicine`과 RAG 변환기는 공유합니다.
- `load`는 UTF-8 바이트를 반환합니다. 파서는 JSON `header/body`와 `response.header/body` 봉투를 지원합니다. 이 봉투 호환성은 Mock 기준이며, 실제 서버와의 호환성을 확인한 상태는 아닙니다. XML·서비스 오류·비정상 인코딩은 실패 처리합니다.
- 원본은 `ingestion.raw`, 정제 데이터는 `ingestion.medicines`에 분리됩니다. 원본 바이트의 UTF-8 텍스트, 알 수 없는 필드, 수집 시각, 소스를 보존합니다. 같은 페이지 내용은 해시로 중복 제거하며 변경된 응답은 별도 원본으로 남깁니다. 원본에 요청 URL·키·HTTP 헤더는 저장하지 않습니다.
- 정제 해시에서 수집 시각을 제외합니다. 품목 ID별 변경 시 버전을 올리고 RAG 등록 대기열에 넣습니다. 미변경 자료는 `lastSeenAt`만 갱신합니다. HTML은 표시용 일반 텍스트로 변환하며 원본은 유지합니다.
- 원본·정제·다음 페이지·등록 대기열을 페이지별 단일 트랜잭션으로 기록합니다. RAG 등록 실패 시 대기열이 유지되어 재실행으로 전달합니다. 등록 후 프로세스가 종료되더라도 기존 `register`가 중복 등록을 방지합니다. 빈 페이지·응답 페이지 불일치·페이지 건수 불일치·동일 페이지의 충돌 중복은 체크포인트를 전진시키지 않습니다.
- 같은 jobId 재실행은 중단 지점에서 이어집니다. 소스·변환 버전·페이지 크기 변경은 거부합니다. 필터가 달라지면 반드시 새 jobId와 revision을 사용해야 합니다. 새 스캔에는 새 jobId를 사용하면 품목 해시로 변경분만 RAG에 전달합니다. `maxPages`로 실행량을 제한하고 AbortSignal로 페이지 사이 또는 로딩 후 중단할 수 있습니다. 주입 로더 자체의 네트워크 취소·타임아웃은 로더 책임입니다.
- `lookupMedicines`는 품목번호·이름·성분의 정확 일치 및 offset/limit을 제공하고, 자연어 검색은 기존 `SearchIndex`를 별도로 사용합니다. 이 함수들은 서버 라이브러리이며 HTTP 경로를 추가하지 않았습니다.
- RAG 문서는 항상 `rights.permission=pending`입니다. 기존 임베딩 인덱서와 실시간 답변기가 이를 외부 전송 대상에서 제외합니다. 로컬 키워드 검색은 가능합니다. 이 파이프라인에는 권한 승인이나 임베딩 실행 기능이 없습니다.

## 실제 연동 전 준비

1. 두 API 활용신청 승인과 트래픽·운영 심의 조건을 확인합니다.
2. 허가정보 Swagger/공식 명세를 확보하고 파라미터·필드·갱신/폐기 처리 규칙을 검증합니다.
3. `DATA_GO_KR_SERVICE_KEY`에 **디코딩된 키**를 서버 비밀 환경변수로 설정합니다. `easyRequest`가 URLSearchParams로 한 번 인코딩합니다. URL에는 키가 포함되므로 요청 객체를 로그·오류·Git·클라이언트로 내보내지 않습니다. `.env*`는 기존 ignore 규칙에 포함됩니다.
4. 별도 승인 작업으로 전송 어댑터를 추가합니다. 타임아웃·취소·호출량 제한·429/5xx 지수 백오프·민감 URL 제거·응답 크기 제한·인증 실패의 재시도 금지를 적용해야 합니다. 현재 전송 함수 및 자동 재시도는 의도적으로 제공하지 않습니다.
5. 재사용 및 Gemini 외부 전송 조건을 근거 URL·검토자·검토일과 함께 확인한 뒤 권한 승격 절차를 별도 구현합니다. 현재는 키가 있어도 수집 파이프라인이 Gemini를 호출하지 않습니다.
6. 승인된 소량 연동에서 응답 봉투·빈 결과·날짜·정렬/페이지 안정성·변경일 필터의 의미를 확인합니다. 이번 작업에서는 수행하지 않았습니다.

## 한계

- 페이지당 처리와 체크포인트는 수백~수천 건 증분 등록을 지원하지만 현재 LocalRepository는 전체 JSON 스냅샷을 읽고 씁니다. 등록 대기열 전달도 품목별 RAG 트랜잭션입니다. 더 큰 규모에서는 Repository 구현을 DB/인덱스·배치 upsert·원본 객체 저장소로 교체해야 합니다. 프로세스 중단 후 stale writer.lock 처리는 기존 README 절차를 따릅니다.
- 실제 공공 API를 실행하지 않았으므로 데이터 스냅샷 이동에 따른 페이지 누락, 삭제·취하 탐지, 서버측 정렬, 갱신일 기반 증분 조회는 보장하지 않습니다. 새 jobId 전체 재스캔과 품목별 해시 비교를 사용하며 미발견 품목을 자동 삭제하지 않습니다.
- 잘못된 페이지는 등록·체크포인트를 롤백합니다. 실패 응답의 원본 격리 저장과 운영 지표는 후속 과제입니다. 임의 HTML의 모든 엔티티를 처리하는 브라우저 파서가 아니며 화면에서는 반드시 텍스트로 렌더링해야 합니다.

## 검증

`npm.cmd test`, `npm.cmd run check`, `npm.cmd run lint`. 테스트는 가상 의약품과 Mock 로더/Provider만 사용하며 공공 API 및 Gemini에 요청하지 않습니다.

최종 결과: 총 52개 중 51개 통과, 실패 0개, 1개 건너뜀(PowerShell 7 미설치). check와 lint 통과. 신규 7개 테스트에는 205개 가상 품목의 페이지 분할·재개, 중복·변경 감지, RAG 전달 실패 복구, 잘못된 페이지 롤백, 인증키 인코딩, 권한 미확인 자료의 임베딩·답변 전송 차단이 포함됩니다. 샌드박스의 Windows 사용자 정보 조회 오류로 전체 테스트는 승인된 로컬 실행에서 검증했습니다.
