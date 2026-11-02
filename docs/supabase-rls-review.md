# Supabase PostgreSQL 설계·RLS 심층 검토

검토일: 2026-11-01 (Asia/Seoul), DrMAS-Mobile

## 결론과 검증 수준

실제 테이블은 profiles, medications, medication_records, care_links다.
요청에 예시로 언급된 medication_logs/patient_guardians는 현재 SQL에 없으며
각각 medication_records/care_links에 해당한다. 이름은 바꾸지 않았다.

정적 검토상 네 테이블 모두 RLS와 최소 권한을 두었고, 환자 소유권·현재 서버
역할·환자 승인 관계를 검사한다. 직접 role/연결 상태 변경을 허용하는 경로는
찾지 못했다. 이는 실행 검증 완료나 보안 보증이 아니다.

로컬 Docker·PostgreSQL 실행 환경을 찾지 못해 설치·기동을 강행하지 않았다.
PostgreSQL 문법 파싱, FK·트리거·권한의 실제 실행, 로컬 RLS, Supabase
PostgREST/JWT 환경의 실행은 **모두 미검증**이다. 테스트 SQL과 절차를 작성했다.

실행한 검사는 정적 소스 계약 9/9건과 기존 모바일 회귀 36/36건이며 모두
통과했다. TypeScript, Expo lint, git diff --check도 통과했다. 준비한 DB
assertion 53건은 실행 0건이며 위 통과 건수에 포함하지 않는다.

## 데이터 구조 및 제약

| 실제 테이블 | 구조와 정적 확인 | 남은 고려 사항 |
| --- | --- | --- |
| profiles | auth.users UUID PK/FK, 표시 이름 길이, 역할 enum, 가입 트리거는 patient 고정 | 기존 Auth 사용자 자동 backfill 없음 |
| medications | 소유자 UUID FK, 제목·상세 길이, 시각·시간대, active | 한 행은 하루 한 시각의 일정; 여러 번 복용하려면 일정 분리/모델 확장 필요 |
| medication_records | 일정+날짜 PK, 일정+환자 복합 FK, taken/taken_at 일치 | 복약 이벤트 원장이 아니라 날짜별 현재 상태; 사용자는 자신의 기록 삭제 가능 |
| care_links | 환자+보호자 유일성, 자기 연결 금지, 요청자=보호자, 승인자=환자, 상태별 timestamp 제약 | 승인 범위는 해당 환자의 모든 복약 일정·기록 읽기이며 기간·항목별 세분화는 없음 |

SQL의 NULL CHECK 우회 여부를 검토했다. 승인 상태는 approved_by IS NOT NULL,
환자 동일성, approved_at 존재, revoked_at 부재를 명시하고 있다. 복약 완료와
시각도 NULL/NOT NULL을 명시한다. 소유자는 기록의 환자 ID뿐 아니라 복합 FK의
일정 환자 ID까지 일치해야 한다.

medications PK(id)와 UNIQUE(id,patient_id)는 논리적으로 중복되지만 복합 FK의
참조 키를 제공한다. care_links의 유일 인덱스는 patient_id 조회를, 별도 인덱스는
guardian_id 조회를 지원한다. 복약 테이블에는 환자·날짜 조회 인덱스가 있다.
실제 데이터 규모에서의 EXPLAIN/부하·정책 함수 호출 비용은 아직 미검증이다.

## 이번 SQL 보강 (원격 미적용)

1. 기존 drmas_private 스키마를 IF NOT EXISTS로 재사용하지 않고 충돌 시
   실패하도록 바꿨다. 스키마의 authenticated 권한도 명시적으로 회수 후
   USAGE만 부여한다. 알려지지 않은 소유권·CREATE 권한을 재사용하지 않는다.
2. 시간대의 단순 길이 검사는 유효하지 않은 문자열도 허용했다.
   pg_catalog.pg_timezone_names를 확인하는 invoker 트리거를 추가했다.
   time의 24:00 endpoint도 차단해 날짜 경계의 모호함을 줄였다.
3. 기존 upsert 호환 UPDATE 권한에는 일정·환자·날짜 키가 들어 있었다.
   다른 환자에 대한 권한 상승은 RLS/FK로 막지만, 자신의 기록을 다른 날짜나
   일정으로 이동할 수 있었다. 키가 실제로 변하면 거부하는 invoker 트리거를
   추가했다. 동일 키 upsert는 허용하도록 설계했으나 실제 실행은 미검증이다.
   삭제 후 재등록까지 금지하는 불변 감사 원장을 구현한 것은 아니다.
4. 요청자·승인자 FK용 인덱스를 추가해 참조 무결성 검사 때의 전체 스캔
   위험을 줄였다. 모든 인덱스는 새 테이블 대상이며 CONCURRENTLY를 쓰지 않는다.
5. 마이그레이션에 5초 lock_timeout과 문장별 60초 statement_timeout을
   추가했다. 잠금 경합 시 무한 대기 대신 실패하여 재검토하도록 한다.

아직 원격 미적용이라고 확인된 최초 SQL만 수정했다. 이미 적용된 환경이
있다면 이 파일을 재실행하지 말고 별도 후속 마이그레이션을 검토해야 한다.

## 권한·RLS 접근 행렬 (설계 기대값, 실행 미검증)

| 주체 | 프로필 | 복약 일정·기록 | 연결 관리 |
| --- | --- | --- | --- |
| 비로그인 anon | 테이블 권한 없음 | 테이블 권한 없음 | 조회·RPC 실행 없음 |
| authenticated지만 sub 없음 | 0행 | 0행 | 승인/요청 거부 |
| 환자 A | 본인 조회·이름만 수정 | A만 CRUD, B 접근 없음 | A가 당사자인 행 조회, 본인만 승인, 철회 가능 |
| 환자 B | 본인만 | B만 CRUD | A의 연결 승인·철회 불가 |
| 미승인/대기 보호자 | 본인만 | 환자 정보 읽기 없음 | 본인 요청/연결만, 자기 승인·직접 status 변경 불가 |
| 승인된 보호자 | 본인만, 환자 이메일/프로필 공개 없음 | 연결된 patient의 일정·기록 SELECT만 | 본인 연결 조회·철회만 |
| 철회된 보호자 | 본인만 | 이후 읽기 없음 | 반복 요청·자기 승인으로 재활성화 불가 |

profiles에는 UPDATE(display_name)만 부여되어 role/id를 수정할 수 없다.
client INSERT/DELETE도 없다. Auth metadata의 role을 프로필에 복사하지 않는다.
care_links에는 client INSERT/UPDATE/DELETE 권한이나 쓰기 policy가 없고,
request/approve/revoke RPC가 auth.uid와 현재 DB 역할·당사자를 검사한다.
현재 역할이 guardian에서 바뀌거나 대상이 더 이상 patient가 아니면 과거
승인만으로 읽지 못한다.

모든 SECURITY DEFINER 함수는 빈 search_path와 스키마 한정 이름을 사용하고
PUBLIC/anon의 실행을 회수했다. 역할 helper는 자기 역할만 반환하며 정책 함수는
허용 여부만 반환한다. 잠재적 재귀 RLS는 trusted owner 실행으로 피한다.
임의 SQL 실행이나 client 전달 role을 받아 승격하는 함수는 없다.

FORCE RLS는 사용하지 않는다. table owner/superuser/BYPASSRLS/service_role은
신뢰 경계이며 일반 사용자 검증용 역할이 아니다. 이 권한을 앱에 주거나
해당 자격증명으로 테스트해서 RLS 통과라고 판단하면 안 된다. 함수 소유자와
클라이언트 역할의 실제 rolsuper/rolbypassrls/상속 관계도 적용 전 확인해야 한다.

## 실행할 수 없었던 검사와 테스트 준비물

- `supabase/tests/static-review.test.cjs`: 정적 소스 계약 검사. PostgreSQL
  파싱·실행 검사가 아니며 이를 RLS 통과 건수로 집계하지 않는다.
- `local_bootstrap.sql`: 빈 전용 로컬 클러스터의 Auth/역할 대체물. 실제
  Supabase Auth를 구현하거나 실제 JWT 서명을 검증하지 않는다.
- `rls_access.sql`: 가상 사용자 4명으로 53개 assertion 준비. anon, 다른 환자,
  미승인/승인/철회 보호자, 역할·status 조작, 복합 FK, timezone, 키 불변성과
  동일 키 upsert를 검사하고 fixture는 ROLLBACK한다. **실행하지 않았다.**
- `compose.local.yml`: 네트워크·호스트 포트 없는 PostgreSQL 17 임시 환경.
  다운로드·실행하지 않았다. 실제 Supabase 버전이 같다고 단정하지 않는다.
- `preflight_readonly.sql`: 적용 전후의 역할·스키마·정책·함수·트리거 메타데이터와
  사용자 건수만 확인하는 SQL. 개인정보나 함수 본문을 출력하지 않는다. 미실행.

명령과 범위는 [테스트 절차](../supabase/tests/README.md)에 정리했다.

## 실제 적용 전 남은 위험

1. 로컬 PostgreSQL 문법·트리거·RLS 실행과 실제 Supabase Data API 검증이
   완료되지 않았다. PostgreSQL 버전, auth.uid 정의, 실제 기본 ACL·역할 상속,
   함수 소유권, pg_timezone_names 접근권한, PostgREST upsert를 검증해야 한다.
2. 마이그레이션 전 생성된 Auth 사용자는 프로필이 없다. 적용 전 건수를
   확인하고 검증된 관리자 보정 절차를 별도로 준비해야 한다. 사용자 앱에서
   role을 포함한 프로필 INSERT를 허용해서 해결하지 않는다.
3. 보호자 요청에는 환자 UUID만 필요하므로 UUID를 아는 승인 보호자가
   pending 요청을 만들 수 있다. 데이터는 승인 전 차단하지만 초대 토큰,
   남용 제한, 스팸 차단·동의 설명은 아직 없다. 연결 재승인 절차도 미구현이다.
4. 동의는 복약 데이터 전체·과거/향후 기록 읽기를 허용한다. 이 범위를
   사용자가 명확히 승인해야 하며 필요하면 테이블/기간별 scope를 추가한다.
   철회는 이미 기기로 내려간 사본이나 캐시를 지우지 않는다.
5. FK 기본 RESTRICT/NO ACTION 때문에 auth.users 삭제의 profiles cascade가
   복약·연결 참조에서 막힐 수 있다. 이는 무단 건강정보 삭제를 피하는 대신
   계정 삭제·법정 보관·익명화 절차를 별도로 요구한다. 임의 cascade를 추가하지 않았다.
6. 날짜별 상태는 투약 사실을 증명하는 감사 로그가 아니다. created_at을 포함한
   client insert 필드, 본인 DELETE, 일정 수정이 기록 해석에 주는 영향을 검토해야 한다.
   의료기록 용도로 보증하지 않는다. 시간대명 확인만으로 DST 모호성은 해결되지 않는다.
7. 정책은 외래키·UNIQUE 오류 등으로 존재 여부가 드러나는 모든 측면 채널을
   제거하지는 않는다. 앱 서비스의 정적 오류 메시지와 실제 API 응답도 점검해야 한다.
8. 정책 함수 성능, 동시 승인·철회·역할 변경, 실제 Auth signup trigger의 실패
   전파, 이메일/토큰 갱신·만료·로그아웃은 별도 통합 검사 대상이다.

AsyncStorage의 기존 복약 기록은 열거나 지우거나 자동 업로드하지 않았다.
UI·복약·AI·SOS 코드도 변경하지 않았다. Cloudtype/Supabase 원격 접속·SQL,
DB 변경, 배포, Git commit/push는 수행하지 않았다.

## SQL Editor 적용 전 백업·복구 계획 (절차만, 미실행)

1. 담당자가 실제 프로젝트·버전·대상 스키마와 승인 범위를 확인한다.
   먼저 로컬 검사와 승인된 별도 개발 Supabase 프로젝트 검사를 통과한다.
   owner SQL Editor의 SELECT 결과만으로 RLS를 검증하지 않는다.
2. Dashboard에서 사용 가능한 백업/PITR 범위와 복원 시점을 확인한다.
   지원 범위는 프로젝트 요금제·설정에 따라 다르므로 있다고 가정하지 않는다.
   별도 논리 백업이 필요하면 승인된 운영 담당자가 안전한 인증 경로로 수행한다.
   비밀번호를 연결 URL·셸 기록·스크린샷에 넣지 않는다.
3. auth/public 스키마의 데이터와 정의, RLS·GRANT·함수·트리거 소유권을
   복구할 수 있는지 확인한다. 백업은 민감정보를 포함할 수 있으므로 암호화해
   저장소 밖 제한된 위치에 두고 복원 연습을 한다. Storage 객체와 외부 Auth
   설정·SMTP는 DB 백업만으로 복구된다고 가정하지 않는다. 현재 값은 수집하지 않았다.
4. preflight 결과에서 대상 이름 충돌·기존 private 스키마·Auth 프로필 누락
   계획·실제 클라이언트 권한을 확인한다. 충돌을 DROP으로 해결하지 않는다.
   적용할 SQL checksum·승인·시간·작업자를 기록하고 신규 가입 쓰기를 조율한다.
5. SQL Editor에서 BEGIN부터 COMMIT까지 전체 파일을 한 번에 적용한다.
   문장 일부만 선택 실행하거나 예외를 무시하고 다음 파일로 넘어가지 않는다.
   lock/statement timeout 오류면 강행하지 않고 잠금과 복구 상태를 확인한다.
6. COMMIT 전 실패는 같은 연결의 트랜잭션을 ROLLBACK하고, 실제 생성 객체
   유무를 메타데이터로 확인한다. 이미 COMMIT했다면 ROLLBACK 명령으로
   되돌릴 수 없다. 애플리케이션 요청을 멈추고 데이터 보존 후 승인된 전진
   수정 또는 검증한 백업 복원을 선택한다. 이후 생성된 데이터 손실 범위도 평가한다.
7. 가입 트리거 장애가 있으면 신규 가입을 임시 중지해 영향을 제한한다.
   트리거 비활성화로 우회하면 프로필 없는 계정이 생길 수 있어 별도 승인과
   보정 계획 없이는 사용하지 않는다. 새 테이블/스키마 DROP CASCADE나
   RLS 해제를 자동 롤백 수단으로 제공하지 않는다.
8. 반영 후 가상 계정의 실제 JWT/publishable key로 전체 접근 행렬과 새 가입,
   프로필 생성·upsert를 확인한다. private 스키마는 Data API 노출 대상에 넣지 않는다.
   원격 실행 결과가 확보되기 전까지 본 보고서의 미검증 표시는 유지한다.

공식 근거:
[PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html),
[SECURITY DEFINER](https://www.postgresql.org/docs/current/sql-createfunction.html),
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[DB 테스트](https://supabase.com/docs/guides/database/testing),
[백업](https://supabase.com/docs/guides/platform/backups).
