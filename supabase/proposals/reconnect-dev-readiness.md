# 보호자 재연결: 로컬 결과 및 Dev 적용 전 검토

## 2026-11-04 일정 결정: 복구 검증 보류

프로젝트 소유자 지시에 따라 오프라인 PostgreSQL 핵심 데이터 부분 복구 테스트를
일정상 보류한다. 전체 Supabase 복구와 핵심 데이터 실제 복구 모두 미검증이다.
암호화 백업·SHA-256·아카이브 읽기 검사는 확보했으나 복구 성공 증거는 아니다.
원래 pg_dump 종료 코드는 미확인이다. 백업/체크섬/비공개 패키지와 기존
복구 실행기 소스는 삭제·변경·재생성하지 않고 보존한다. V: 용량 차단을
우회하지 않으며 클러스터 생성/복원/네트워크 차단은 재개 승인 전 수행하지 않는다.

기능 개발을 우선한다. 다음 순서는 모바일 재요청 지원 코드/Mock 테스트 준비,
정확한 Dev SQL 적용 승인, 합성 계정 JWT/RLS·실기기 검증, SOS 전달 기능 개발이다.
복구 검증 보류는 Dev 마이그레이션 또는 실제 사용자 데이터 변경 승인이 아니다.
적용 시점에는 백업 시각 이후의 쓰기 유무를 확인하고 필요하면 새 백업을 확보한다.
미검증 복구 위험을 명시한 상태에서 프로젝트 소유자가 적용 여부를 결정한다.

최소 복구 준비는 적용 직전 함수·권한·제약 정의와 연결 행 수/상태별 건수의
비공개 기록, 유효한 백업/체크섬 보존, 유지보수 중 연결 쓰기 중지, 파일 전체를
하나의 트랜잭션으로 실행하는 계획이다. COMMIT 전 오류는 롤백한다.
COMMIT 후에는 신규 연결 쓰기를 중지하고 이력을 삭제하지 않는 forward fix를
검토한다. 중복된 종료 이력이 생긴 뒤 전체 pair UNIQUE를 단순 복원하거나,
종료 사유를 쓰지 않는 옛 revoke 함수만 복원하지 않는다. 현재 데이터에 안전한
실행 가능한 역방향 SQL이 검증됐다는 뜻은 아니며, 백업 복원도 자동 실행하지 않는다.

모바일 작업: 재요청 미지원 안내/23505 오류 문구를 활성 연결 중복 안내로 변경하고,
closure_reason이 없는 구 스키마에도 호환되는 상태 표시, 종료 사유 미상 처리,
이전 이력과 신규 pending 구분, 연결 목록 100개 제한의 페이지 처리를 준비한다.
DB 미적용 상태에서 재요청 성공을 약속하지 않으며 클라이언트가 직접 행을 삭제/
갱신해 UNIQUE를 우회하지 않는다. 계정 전환·인증 만료·중복 클릭 방지는 유지한다.

SOS는 현재 카운트다운 이후 같은 기기의 메모리 알림만 생성한다. 서버 전송,
다른 기기 수신, 확인/재시도/중복 제거/전달 상태와 실기기 테스트가 남아 있다.
승인된 연결만 수신 가능하고 철회 후 접근이 차단되는 서버 권한 모델을 먼저
합성 테스트로 준비한다. 알림 전송 성공/수신/확인을 구분하고 실제 긴급 신고나
보호자 연락이 되지 않았는데 완료 표시하지 않는다. 새 DB 객체가 필요하면
마이그레이션 초안을 별도로 검토·승인하고, 의료 RAG 기능은 변경하지 않는다.

이 문서는 사용자가 보고한 PostgreSQL 17.11 실행 결과와 로컬 소스 검토를
구분해 기록한다. 에이전트가 SQL 실행 결과를 직접 관찰한 보고서는 아니다.
Supabase Dev 적용은 미승인·미실행이며 준비 조건 충족 전 보류한다.

## 실행 결과의 근거

대상은 사용자 확인에 따른 독립 127.0.0.1:55432/drmas_rls_test이다.

| 항목 | 사용자 보고 | 한계 |
| --- | --- | --- |
| bootstrap / 초기 마이그레이션 | PASS | 에이전트 실행 아님 |
| 기존 rls_access.sql | PASS | 재연결 변경 전 기준 |
| 재연결 SQL | COMMIT, PASS | Dev에는 적용하지 않음 |
| single-session.sql | PASS, ROLLBACK, exit 0 | 로컬 역할 모의실험 |
| session-b.sql | concurrent_duplicate_23505, exit 0 | B 출력만으로 대기 증명 불가 |
| concurrency-verify.sql | real_concurrency_one_active_pair, exit 0 | 현재 파일과 실행 파일 동일성 전제 |
| concurrency-cleanup.sql | COMMIT, PASS | 사용자 보고, 잔여 조회 직접 확인 필요 |
| session-a.sql | 상세 출력 미확인 | 대기 관찰/COMMIT 출력 별도 확인 필요 |

현재 verify는 manifest의 a_observed_wait AND b_duplicate와 총/활성 관계
각 1개를 요구한다. 현재 A는 pg_blocking_pids로 B가 실제 A를 기다린 것을
관찰한 뒤에만 a_observed_wait를 설정하고 COMMIT한다. 따라서 동일 파일을
실행했다면 verify PASS는 대기에 대한 간접 근거다. 하지만 A 로그와 실행
파일 동일성이 확인되지 않았으므로 독립적인 A 증거 확보 완료로 표시하지 않는다.
cleanup으로 manifest가 제거된 뒤 이를 복구하거나 이력만으로 추측하지 않는다.
가능하면 기존 A 출력의 concurrent_wait_observed / session_A_committed와
exit 0을 확인한다. 증거가 없으면 별도 승인된 로컬 재실행으로 확보한다.

에이전트의 로컬 읽기 전용 조회 시도는 비밀번호 미제공으로 인증 전에 중단됐다.
비밀번호는 수집/출력하지 않았다. 따라서 fixture 정리는 사용자 보고 PASS,
현재 잔여 상태는 직접 미확인이다. reconnect/cleanup-readonly.sql은
비밀번호 프롬프트로 사용자가 실행할 준비물이다. 기대값은 모든 count 0,
두 helpers_removed true이며, 어떤 잔여 데이터도 자동 삭제하지 않는다.

## 호환성: 로컬 계약 일치와 현행 Dev 일치를 구분

초기 마이그레이션 기준 request_care_link(target_patient uuid) returns uuid,
approve_care_link(link_id uuid) returns void, revoke_care_link(link_id uuid)
returns void 계약을 유지한다. 모바일 RPC 호출은 이 계약과 일치한다.
pending/approved/revoked enum을 유지하고 종료 사유만 nullable text로 추가한다.
기존 종료 행의 사유는 NULL(미상)로 남긴다. 기존 승인 관계는 갱신하지 않는다.
care_links SELECT 참여자 정책과 복약 RLS는 변경하지 않고 직접 DML을 열지 않는다.

현행 Dev 정의/소유자/권한/정책은 이번 작업에서 접속하지 않아 미확인이다.
오래된 카탈로그 건수나 과거 snapshot은 현재 일치 증거가 아니다. 적용 전
별도 승인된 읽기 전용 점검으로 다음을 확인한다.

- 기존 pair UNIQUE의 실제 이름/컬럼 순서와 모든 추가 UNIQUE/FK 의존성.
  예상 이름과 다르거나 외부 FK 의존성이 있으면 중단한다. CASCADE 금지.
- closure_reason/새 인덱스가 이미 있지 않은지 및 전체 RLS/GRANT/역할 상속.
- RPC 전체 정의, 인자 이름·반환형·소유자·SECURITY DEFINER·고정 search_path.
  CREATE OR REPLACE는 기존 소유자와 추가 ACL을 유지한다. 신뢰할 수 없는
  소유자/추가 EXECUTE grantee가 있으면 현재 초안만으로 해결됐다고 보지 않는다.
- auth.uid 및 기존 트리거는 Supabase 실제 구현을 사용한다. 로컬 bootstrap의
  Auth 대체물이나 고정 DB 이름 테스트를 SQL Editor에 실행하지 않는다.
- 원본/변경 후 컬럼·제약·인덱스·정책·함수 카탈로그를 독립 기준과 비교한다.
  비교 도구의 초기 마이그레이션 전용 inventory도 승인 후 갱신해야 한다.

모바일은 현재 RPC 계약과 호환되나, 재요청 미지원 안내/중복 오류 문구는 이전
동작을 설명한다. Dev 변경 뒤 별도 모바일 작업으로 수정하고 이력 100개 상한과
페이지 처리도 검토해야 한다. 이번에는 모바일 코드를 변경하지 않는다.

## 백업·적용·복구 계획 (실행하지 않음)

1. 제공되는 Dev 백업/PITR 가용성과 실제 복구 절차·보존기간을 확인한다.
   스키마(함수 owner/ACL/RLS 포함) 및 관계 데이터의 시점 백업을 비공개 보관하고
   복구를 독립 환경에서 검증한다. 실제 사용자 데이터를 Git/테스트에 복사하지 않는다.
2. 정확한 SQL/적용 owner/목표 프로젝트와 유지보수 시간을 승인받는다. 관계 요청을
   일시 정지하고 ACCESS EXCLUSIVE의 영향, 5s lock/60s statement timeout을 확인한다.
   한 트랜잭션 전체를 실행하며 초기 마이그레이션을 재실행하지 않는다.
3. COMMIT 전 실패는 트랜잭션 ROLLBACK 후 상태를 확인한다. 부분 파일 재실행 금지.
   성공 후에는 기존 ID·승인 메타데이터·전체 행 수 불변과 정책/ACL 보존을 확인한다.
4. COMMIT 후 문제 발생 시 신규 연결 쓰기를 중단하고 읽기 권한 안전성을 확인한다.
   종료 사유를 기록하지 않는 이전 revoke RPC를 단순 복원하면 새 CHECK와 충돌할 수 있다.
   전체 UNIQUE 복원도 이미 생성된 동일 pair 이력 때문에 실패할 수 있다.
   이력 삭제나 승인 재사용 대신 호환되는 forward fix를 검토한다. 전체 백업 복원은
   새 정상 쓰기 손실 영향을 검토하고 별도 승인 없이는 수행하지 않는다.
5. 재요청 남용의 cooldown/blocking 정책은 미구현이며 공개 서비스 전 검토한다.
   현재 로컬 검증은 approve-vs-revoke 등 모든 경쟁 순서를 포괄하지 않는다.

## 실제 일반 사용자 JWT/RLS 검증 계획

별도 승인 후 합성 환자 A/B와 보호자 G/H 계정만 사용한다. 보통 사용자
publishable key + 각 계정의 실제 JWT로 Data API/RPC를 호출한다. service_role,
SQL Editor owner 조회, 임의 sub 설정 결과를 JWT 검증 성공으로 취급하지 않는다.

- 누락/변조/만료 JWT, 로그아웃/갱신 흐름, 올바른 JWT의 role 전달 확인.
- G 요청 전/pending/거절/취소/해제/재요청 pending에는 A 복약·기록 0건 또는 거부.
- A가 새 ID를 승인한 뒤에만 G의 A 읽기 허용, B 읽기·복약 쓰기는 계속 차단.
- B/H의 A-G 관계 조회·승인·거절·해제 차단, 직접 care_links DML 및 역할 승격 차단.
- 자기 요청·없는 대상·중복·과거 ID 승인 재시도 차단, 새 요청이 옛 승인을 상속하지 않음.
- guardian 역할 제거 시 기존 승인으로도 읽기 차단, 인증 계정 전환/복귀 시 UI 새로고침.
- 역할·권한 없는 요청은 실패해야 하며, 결과는 상태/테스트명만 기록하고 토큰/본문은 숨긴다.

Dev 마이그레이션 적용, JWT 테스트, Push, 배포는 이 문서 작성으로 승인되지 않는다.

## 보존 전 최종 검토 및 읽기 전용 Dev 준비물

기존 미추적 15개는 재연결 변경안/설명, 합성 정책 테스트, 로컬 통합 테스트 및
fixture 정리 SQL이다. 정리 SQL의 DELETE/DROP은 manifest와 고정 합성 ID로
제한되며 원격 실행용이 아니다. 실제 의료자료·환자정보·수집 원본·백업은 포함하지 않는다.
기존 SQL과 데이터는 보존하며, 이번 검토에서는 DB에 접속하지 않는다.

사용자 복귀 후 순서:

1. reconnect/README.md의 -X -W 고정 로컬 연결 인자로 cleanup-readonly.sql을
   실행해 모든 잔여 건수 0 및 helpers_removed true를 확인한다.
2. 기존 세션 A 출력에서 PASS concurrent_wait_observed,
   PASS session_A_committed, 종료 코드 0을 확인한다. 출력이 없으면 미확인을 유지한다.
3. 별도 읽기 전용 Dev 조회 승인 후 SQL Editor에서 기존
   verification/catalog-readonly.sql을 먼저 실행한다. 기존 v1 포맷과 해시 기반
   함수 설정 출력 및 schema-compare.cjs를 그대로 재사용한다.
4. 별도로 verification/reconnect-preflight-readonly.sql을 실행한다. 이 보완 SQL은
   함수 owner/명시적 grantor·grantee, owner 역할 속성, 직접 역할 상속 edge,
   care_links 양방향 FK와 구 pair 인덱스 의존성, 기존/신규 구조 존재 여부를 확인한다.
   PostgreSQL 17 대상이며 membership 옵션은 16 이상 카탈로그 컬럼을 사용한다.
5. 두 결과를 별도 비공개 snapshots 파일로 보관한다. 보완 결과는 v1 비교 도구의
   입력이 아니며 원본 v1 JSON에 병합하지 않는다. 결과 원문·역할명·해시를 로그나
   Git에 넣지 않는다. 관리자 카탈로그 조회는 JWT/RLS 동작 증명이 아니다.
6. baseline과 추가 의존성/권한을 사람이 검토한 뒤 정확한 SQL의 Dev 적용을 별도로
   승인한다. 두 SQL 모두 읽기 전용이지만 현재 작업에서는 실행하지 않는다.

기존 catalog-readonly.sql은 FK 정의를 해시로 비교하고 테이블/컬럼 GRANT의
실효 권한과 RLS 정책 해시를 제공한다. 보완 SQL은 이를 대체하지 않는다.
직접 role membership edge는 상속 경로를 검토할 자료이며 자동 권한 안전 판정이 아니다.
exposed_schemas가 NULL이면 API 노출 설정이 안전하다는 뜻이 아니므로 대시보드에서
별도로 확인한다. 두 번의 조회는 서로 다른 snapshot이므로 변경 없는 시간에 확보하고
실제 적용 직전 재확인한다. 읽기 전용 결과만으로 자동 적용/PASS를 결정하지 않는다.
