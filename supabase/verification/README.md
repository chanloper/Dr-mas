# DrMAS-Dev P1 검증 준비

작성일: 2026-11-02. **원격 연결·SQL·가상 계정 생성·원격 쓰기는 실행하지 않았습니다.** 이번에 실행한 것은 로컬 소스 계약 검사와 합성 JSON 비교기 테스트뿐입니다. 기존 모바일 소스·마이그레이션은 수정하지 않았습니다.

## 검증 단계를 분리합니다

| 단계 | 권한/자료 | 현재 상태 | 증명하는 범위 |
|---|---|---|---|
| L0 소스 계약/비교기 | 파일·합성 카탈로그 | 로컬 실행 완료 | 목록 추출, 차이 탐지·비밀값 비출력 동작 |
| L1 기준 DB 구성 | 새 격리 기준 환경·가상 데이터 | 별도 승인 필요, 미실행 | 현재 마이그레이션의 SQL 실제 실행 가능 여부 |
| L2 Dev 메타데이터 추출 | 승인된 관리 연결, READ ONLY | 별도 승인 필요, 미실행 | Dev 카탈로그와 신뢰된 기준 카탈로그의 구조 비교 |
| L3 사용자 조회 격리 | publishable key + 일반 사용자 JWT | 별도 승인 필요, 미실행 | 기존 가상 자료의 사용자별 조회 허용/차단 |
| L4 사용자 쓰기·동의 수명주기 | 동일 사용자 JWT + 가상 자료 쓰기 | 별도 쓰기 승인 필요, 미실행 | 수정·삭제 차단, 요청·승인·철회와 실제 RLS |

L2의 관리자 조회 성공은 L3/L4 통과 증거가 아닙니다. 기존 모바일의 `scripts/verify-dev-rls.cjs`도 A/B 프로필과 일부 타인 자료 조회를 검사할 뿐, 양방향 쓰기 차단·보호자 동의를 검증하지 않습니다. 해당 도구는 로그인/로그아웃으로 Auth 세션을 생성·폐기하므로 **전체 시스템에 아무 쓰기도 없는 검사**라고 표현하면 안 됩니다. 이번 작업에서는 실행하지 않았습니다.

## 로컬 SQL 기준 기대 목록

기준: `supabase/migrations/202611010001_auth_and_care.sql`. 자동 목록:

```powershell
node supabase/verification/schema-compare.cjs inventory
```

이 명령은 파일만 읽고 마이그레이션·카탈로그 추출 SQL의 SHA-256과 객체 목록을 출력합니다. SQL 파서나 DB 실행기는 아닙니다.

### 테이블·컬럼: 4개 테이블, 27개 컬럼

| 테이블 | 컬럼 |
|---|---|
| profiles | id uuid PK/FK, display_name text NOT NULL, role drmas_role NOT NULL, created_at timestamptz NOT NULL |
| care_links | id uuid PK, patient_id uuid NOT NULL, guardian_id uuid NOT NULL, requested_by uuid NOT NULL, status drmas_link_status NOT NULL, approved_by uuid NULL, approved_at timestamptz NULL, revoked_at timestamptz NULL, created_at timestamptz NOT NULL |
| medications | id uuid PK, patient_id uuid NOT NULL, title text NOT NULL, detail text NOT NULL, time_local time NOT NULL, timezone text NOT NULL, active boolean NOT NULL, created_at timestamptz NOT NULL |
| medication_records | medication_id uuid NOT NULL, patient_id uuid NOT NULL, day date NOT NULL, taken boolean NOT NULL, taken_at timestamptz NULL, created_at timestamptz NOT NULL |

컬럼 기본값·NOT NULL·타입·collation·컬럼 권한을 카탈로그에서 비교합니다. 기본값은 본문 대신 SHA-256을 비교합니다. enum 순서도 의미가 있으므로 정렬해 숨기지 않습니다.

- `drmas_role`: patient, guardian.
- `drmas_link_status`: pending, approved, revoked.
- PK 4개: 각 테이블의 id, 단 `medication_records`는 (medication_id, day).
- UNIQUE 2개: care_links(patient_id, guardian_id), medications(id, patient_id).
- CHECK 기대 12개: 표시 이름 길이, 연결 당사자/요청자/승인자/상태별 시각 제약, 복약 제목/상세/시간/시간대 길이, taken/taken_at 일치. 실제 엔진의 제약 정의는 해시로 대조합니다.

### FK 기대 8개

1. profiles.id → auth.users.id (ON DELETE CASCADE).
2. care_links.patient_id → profiles.id.
3. care_links.guardian_id → profiles.id.
4. care_links.requested_by → profiles.id.
5. care_links.approved_by → profiles.id.
6. medications.patient_id → profiles.id.
7. medication_records.patient_id → profiles.id.
8. medication_records(medication_id, patient_id) → medications(id, patient_id).

마지막 복합 FK는 다른 환자의 일정에 기록을 연결하지 못하게 합니다. profiles 삭제는 다른 FK 때문에 막힐 수 있으므로 계정 삭제는 별도 절차가 필요합니다.

### 인덱스 기대 11개

명시 인덱스 5개:

- care_links_guardian: (guardian_id, patient_id, status).
- care_links_requested_by: (requested_by).
- care_links_approved_by: (approved_by), approved_by IS NOT NULL 조건.
- medications_patient: (patient_id).
- medication_records_patient: (patient_id, day).

PK/UNIQUE에 따른 인덱스 6개도 포함합니다. 정의 해시·unique/primary·valid/ready 상태를 비교합니다.

### RLS 정책 기대 11개

- profiles: profiles_read_self, profiles_edit_name.
- care_links: care_links_read_participant.
- medications: medications_read, medications_add_self, medications_edit_self, medications_remove_self.
- medication_records: records_read, records_add_self, records_edit_self, records_remove_self.

네 테이블 RLS=true, 현재 SQL은 FORCE RLS=false입니다. 이를 자동 변경하지 않습니다. 정책명만 같다고 통과시키지 않고 USING/WITH CHECK 정의 해시·적용 역할·명령·permissive 설정을 비교합니다.

### GRANT·신뢰 경계

- public/anon/authenticated의 테이블 권한을 먼저 회수합니다.
- authenticated: 네 테이블 SELECT, profiles의 display_name만 UPDATE.
- authenticated: medications/medication_records INSERT·DELETE, 정해진 컬럼 UPDATE.
- care_links 직접 INSERT/UPDATE/DELETE 및 profiles role 변경은 허용하지 않습니다.
- medication_records UPDATE 허용 컬럼에는 upsert 키가 있으나 identity 트리거가 실제 키 변경을 거부해야 합니다.
- service_role: 네 테이블 ALL. 관리자/BYPASSRLS/테이블 소유자는 사용자 RLS 검증에 사용하지 않습니다.
- drmas_private: 클라이언트 CREATE 금지, authenticated USAGE 및 필요한 helper EXECUTE만 허용.

명시 ACL과 PUBLIC·역할 상속을 반영한 `has_*_privilege` 결과를 함께 비교합니다. 현재 추출기는 세 클라이언트 역할의 유효 객체 권한과 superuser/BYPASSRLS 속성을 확인하지만, 임의 관리 역할 전체의 멤버십·권한을 보증하는 도구는 아닙니다. 신뢰된 함수·테이블 소유자와 관리 역할은 담당자가 별도로 확인해야 합니다.

### RPC·함수 기대 8개, 사용자 트리거 3개

| 함수 | 반환 | 보안 방식 |
|---|---|---|
| public.request_care_link(target_patient uuid) | uuid | SECURITY DEFINER |
| public.approve_care_link(link_id uuid) | void | SECURITY DEFINER |
| public.revoke_care_link(link_id uuid) | void | SECURITY DEFINER |
| drmas_private.current_role() | drmas_role | SECURITY DEFINER |
| drmas_private.can_read_patient(target uuid) | boolean | SECURITY DEFINER |
| drmas_private.handle_new_user() | trigger | SECURITY DEFINER |
| drmas_private.validate_medication_timezone() | trigger | SECURITY INVOKER |
| drmas_private.keep_record_identity() | trigger | SECURITY INVOKER |

모든 함수의 빈 search_path, 소유자, EXECUTE 권한, 인자·반환 타입·정의 해시를 비교합니다. 정의 본문을 보고서에 출력하지 않습니다. 함수 전체 정의의 해시는 같은 PostgreSQL 메이저와 같은 생성 방식에서 비교해야 합니다. 공백/줄바꿈 등 의미가 같은 차이도 검토 대상으로 나타날 수 있습니다.

- drmas_auth_user_created: auth.users AFTER INSERT → handle_new_user.
- drmas_medication_timezone: medications BEFORE INSERT 또는 timezone UPDATE.
- drmas_record_identity: medication_records BEFORE UPDATE.

Dev에 추가된 다른 auth.users 트리거와 public 테이블·뷰도 차이로 표시합니다. 추가 객체를 자동 삭제하거나 무시하지 않습니다.

## 실제 Dev와 비교하는 안전한 방법

`catalog-readonly.sql`은 repeatable-read READ ONLY 트랜잭션, 15초 문장 제한, 2초 잠금 대기를 사용합니다. pg_catalog만 읽고 종료 시 ROLLBACK합니다. 애플리케이션 행·auth.users 행·비밀번호·API 키·함수 본문은 출력하지 않습니다. 알려진 객체가 없으면 빈 목록으로 나타나므로 누락을 발견할 수 있습니다. SQL 자체의 PostgreSQL 실행은 아직 검증하지 않았습니다.

1. **대상 확인과 승인:** 사용자/운영자가 DrMAS-Dev 프로젝트의 참조값·연결 호스트·포트를 비공개로 확인합니다. 프로젝트 이름만으로 대상을 신뢰하지 않습니다. 메타데이터 조회의 연결 역할·시간·범위를 별도로 승인합니다.
2. **새 인증정보:** 과거 MariaDB 또는 노출된 키를 재사용하지 않습니다. Supabase DB 비밀번호와 publishable key는 서로 다릅니다. DB 직접 연결이 필요하면 새 승인 자격증명, 비밀번호 숨김 입력, 공급자 안내에 맞는 TLS 검증을 사용합니다. 비밀번호가 포함된 URI·명령행·PGPASSWORD 대입문·로그·채팅을 만들지 않습니다. SQL Editor에서 실행하는 경우에도 대상 확인과 별도 승인이 필요합니다.
3. **신뢰된 기준 준비:** 같은 PostgreSQL 메이저·동등한 Supabase 기본 권한을 가진 새 격리 기준 환경에서만 현재 마이그레이션을 검토·적용하고 같은 추출 SQL을 실행합니다. 기존 Dev에 초기 SQL을 다시 적용하지 않습니다. 기존 vanilla PostgreSQL의 local_bootstrap 대체 환경은 플랫폼 권한까지 일치하는 기준이라고 단정할 수 없습니다. 이 단계도 이번에는 실행하지 않았습니다.
4. **메타데이터 캡처:** 기준 결과를 `snapshots/reference-catalog.json`, 승인된 Dev 결과를 `snapshots/dev-catalog.json`으로 비공개 저장합니다. SQL Editor는 단일 snapshot 셀의 JSON만 저장합니다. psql을 사용할 경우 시작 파일을 읽지 않는 `-X`, 오류 중단, 조용한 단일 열·비정렬 출력을 사용하고 비밀번호는 `-W` 프롬프트로 입력합니다. 명령의 실행은 담당자가 별도 승인 후 수행해야 합니다.
5. **UTF-8:** PowerShell 5.1의 기본 리다이렉션 인코딩에 의존하지 않습니다. UTF-8로 저장하고, JSON 앞뒤에 BEGIN/ROLLBACK·오류·헤더가 섞이지 않았는지 확인합니다. 비교기는 UTF-8 BOM은 허용하고 잘못된 UTF-8/JSON은 거부합니다. 원격 오류 원문을 채팅에 붙이지 않습니다.
6. **로컬 비교:** 아래 명령은 네트워크나 DB를 사용하지 않습니다.

```powershell
# 저장소 루트에서 실행; snapshots 폴더는 Git ignore 대상입니다.
node supabase/verification/schema-compare.cjs inventory

# 기준 환경에 현재 마이그레이션을 적용했음을 담당자가 확인한 후에만:
node supabase/verification/schema-compare.cjs bind-reference supabase/verification/snapshots/reference-catalog.json --reviewed-disposable-reference

# 위 출력 JSON을 reference.json으로 UTF-8 비공개 저장한 뒤:
node supabase/verification/schema-compare.cjs compare supabase/verification/snapshots/reference.json supabase/verification/snapshots/dev-catalog.json
```

비교기는 원격 접속 기능이 없고 파일만 읽습니다. bind-reference는 기준 출처에 대한 담당자 확인을 요구하고, 현재 마이그레이션과 추출 SQL의 해시에 묶습니다. **해시를 붙였다고 실제 기준 DB에 해당 SQL을 적용한 사실이 증명되는 것은 아닙니다.** Dev 결과를 그대로 기준으로 삼으면 독립 검증이 되지 않습니다.

- exit 0 / catalogues_match: 수집된 카탈로그 범위의 일치. 실제 RLS와 Auth 설정은 계속 unverified.
- exit 2 / drift_detected: 차이 위치·종류만 출력. 실제 값이나 정책/함수 본문은 출력하지 않음.
- exit 3 / unverified: PostgreSQL 메이저가 달라 직접 일치 판정 보류.
- exit 1: 입력·기준 출처·현재 소스 해시·기준 목록 문제. 원격이나 SQL이 성공했다는 뜻이 아님.

소유자·권한·기본값·함수 해시 차이를 자동 정규화해 통과시키지 않습니다. 같은 메이저라도 버전·기본 ACL·생성 방식 차이가 있을 수 있어 수동 검토가 필요합니다. 수정이 필요하면 별도 승인한 후속 마이그레이션을 설계합니다.

`pgrst.db_schemas`가 DB 세션에 없으면 exposed_schemas=null입니다. 이 경우 Data API 노출 스키마는 반드시 Dashboard 설정으로 별도 확인합니다. 카탈로그 일치는 이메일 제공자·확인 정책·SMTP·리다이렉트·키 제한·JWT 검증·함수 배포 설정의 일치까지 보증하지 않습니다.

## 가상 계정과 fixture 준비 계획 — 아직 생성하지 않음

- 환자 A, 환자 B, 미승인 보호자 G0, 승인/철회 수명주기를 검사할 보호자 G1을 사용합니다.
- 전용 테스트 계정임을 식별하는 안전한 실행 목록을 관리하고 실제 환자 계정을 사용하지 않습니다. 비밀번호·JWT는 숨김 입력/보안 환경에서 메모리로만 취급하고 보고서에 저장하지 않습니다.
- A와 B 각각 식별 가능한 합성 복약 일정 1개 이상과 날짜별 합성 기록 1개 이상을 먼저 준비합니다. 소유자의 정상 조회로 fixture 존재를 확인합니다. fixture가 없으면 차단 테스트를 PASS가 아닌 UNVERIFIED로 처리합니다.
- 가입 기본 역할은 patient입니다. 보호자는 별도 승인된 관리자 준비 단계에서만 검증된 가상 계정의 profiles 역할을 부여합니다. 사용자 metadata나 클라이언트 UPDATE로 역할을 설정하지 않습니다.
- 관리자 계정 생성/역할 설정/fixture 준비 결과와 사용자 권한 테스트 결과는 서로 다른 섹션·실행 단위로 기록합니다. 관리자 클라이언트가 일반 테스트에 섞이지 않게 합니다.
- SQL Editor owner/service_role/secret key로 성공한 조회를 RLS PASS로 집계하지 않습니다. 사용자 테스트는 publishable key와 각 계정의 **실제 사용자 JWT**를 사용하고 사용자 신원 및 DB 프로필 역할을 먼저 확인합니다. JWT payload를 디코딩해 role을 읽는 것만으로 신원·업무 역할을 신뢰하지 않습니다.

## 사용자 JWT 권한 검증 행렬

각 케이스는 확인된 fixture ID로 범위를 좁혀 직접 Data API/RPC를 호출합니다. 앱 UI가 요청을 막았다는 사실만으로 RLS를 검증했다고 하지 않습니다. 아래는 계획이며 원격 실행한 결과가 아닙니다.

| 시나리오 | 일반 사용자 자격 | 기대 결과 |
|---|---|---|
| A/B 각각 본인 프로필·일정·기록 조회 | A/B JWT | 합성 fixture 조회 성공; 음성 테스트의 양성 대조 |
| A가 B, B가 A 프로필·일정·기록 조회 | 각 JWT | 접근 오류 또는 0행 |
| A가 B, B가 A 일정·기록 수정·삭제 | 각 JWT | 권한 오류 또는 영향 0행, 소유자 재조회에서 원본 불변 |
| 다른 환자 patient_id로 일정/기록 삽입·upsert | A/B JWT | RLS 거부. 잘못된 FK만으로 실패한 경우 RLS PASS로 보지 않음 |
| 자신의 표시 이름 변경 / role 또는 id 변경 | A JWT | 표시 이름만 허용, role/id 변경 거부 |
| care_links 직접 INSERT/UPDATE/DELETE | A/G1 JWT | 모두 거부; 정해진 RPC만 사용 |
| G0 또는 pending 상태 G1이 A 일정·기록 조회 | 해당 보호자 JWT | 접근 오류 또는 0행 |
| G1이 A에게 request_care_link | G1 JWT | pending 생성, 아직 A 자료 읽기 불가 |
| 보호자의 자기 승인 / B가 A 연결 승인 | G1/B JWT | 거부 |
| A가 자신의 pending 연결 승인 | A JWT | approved 및 환자 승인 정보 설정 |
| 승인 후 G1이 A 일정·기록 조회 | 기존 G1 JWT | A fixture 읽기 허용, B 자료는 계속 차단 |
| 승인 후 G1이 A 일정·기록 쓰기 | G1 JWT | 거부, 소유자 재조회 불변 |
| A 또는 G1이 해당 연결 철회 | 각 참가자 JWT, 독립 fixture | revoked, 이후 G1 읽기 차단 |
| 철회 직후 갱신 전의 기존 G1 JWT로 재조회 | 같은 G1 JWT | 이미 발급된 JWT라도 DB 연결 상태에 따라 읽기 차단 |
| 철회 관계 재요청·재승인 | G1/A JWT | 현재 SQL은 재활성화 거부. 재연결 기능은 미구현으로 기록 |
| 비당사자의 연결 철회 | B JWT | 거부 |
| 비로그인 네 테이블 조회·RPC 실행 | publishable key, 사용자 JWT 없음 | 차단 |
| 미인증/만료/잘못된 JWT | 해당 입력 | 인증 실패. 이 결과만으로 정상 JWT의 RLS 거부를 증명하지 않음 |
| 기록 키 변경, 타인 일정 FK, 잘못된 timezone | 환자 JWT | 정해진 트리거·FK·CHECK 거부를 RLS와 별도 집계 |

읽기 차단은 SELECT 배열 0행 또는 명확한 권한 오류가 기대값입니다. HTTP 200/204만으로 수정 성공·실패를 판단하지 않습니다. UPDATE/DELETE는 반환 행/영향 범위와 소유자 전후 대조가 필요합니다. 401·네트워크 오류·테이블 없음·잘못된 fixture·FK 오류를 모두 "RLS가 잘 막았다"로 합산하지 않습니다. 일반 사용자 자신의 허용 작업 성공도 같이 확인해야 합니다.

**쓰기 거부 테스트도 별도 쓰기 승인이 필요합니다.** 정책이 잘못됐다면 실제로 합성 자료가 변경될 수 있습니다. Supabase REST/RPC 여러 요청을 마지막 ROLLBACK으로 되돌릴 수 있다고 가정하면 안 됩니다. 실행 ID로 제한한 가상 자료만 만들고, 실패 시 즉시 중지한 뒤 승인된 정리 절차로 처리합니다. 실제 사용자 자료를 broad DELETE로 정리하지 않습니다. 계정 삭제는 FK 때문에 실패할 수 있어 별도 검토가 필요합니다.

이 계획에는 쓰기/관리자 작업을 자동 실행하는 러너가 없습니다. 기존 `supabase/tests/rls_access.sql`은 고정 로컬 DB 전용입니다. **DrMAS-Dev SQL Editor에 붙여 넣지 않습니다.** 그 도구의 SET LOCAL ROLE·가상 sub는 실제 JWT/HTTP 검증을 대신하지 않습니다.

## Dev 검증 체크리스트

- [ ] 담당자가 DrMAS-Dev 참조값·프로젝트·검증 범위를 확인하고 연결을 승인했다.
- [ ] 과거 노출 인증정보를 재사용하지 않았고 비밀값이 인자·로그·Git에 없다.
- [ ] 별도 기준 환경의 출처와 현재 SQL 해시, PostgreSQL 메이저를 기록했다.
- [ ] 네 테이블/27컬럼, enum, PK/UNIQUE/FK/CHECK, 11인덱스, 11정책, GRANT, 8함수, 3트리거를 비교했다.
- [ ] 함수·테이블 소유자, effective 권한, anon/authenticated의 superuser/BYPASSRLS 부재를 검토했다.
- [ ] private 스키마가 Data API 노출 대상이 아니며 Auth 제공자·SMTP·확인·리다이렉트를 별도 점검했다.
- [ ] 기존 Auth 계정의 프로필 누락을 확인할 별도 승인 절차를 정했다. 앱 INSERT로 보정하지 않는다.
- [ ] 모든 fixture가 가상 계정·가상 데이터이며 양성 대조가 있다.
- [ ] A/B 양방향 격리와 미승인/승인/철회 보호자 상태를 실제 사용자 JWT로 검사했다.
- [ ] 관리자 조회와 사용자 RLS 결과를 분리했고 fixture 부재를 통과로 집계하지 않았다.
- [ ] 쓰기/계정/동의 변경은 별도 승인 범위에서만 실행했다.
- [ ] 로그인 유지·갱신·로그아웃·계정 전환·캐시·오프라인 및 웹/네이티브 결과를 검사했다.

## 남은 기능·보안 위험

보호자 승인 운영 절차, 초대 토큰/남용 제한, 동의 범위·버전, 연결 UI·보호자 조회 화면, 철회 후 캐시 처리와 재연결은 미완성입니다. 계정 삭제/보관, 기존 Auth 계정 프로필 보정, 복약 감사 원장 여부도 결정해야 합니다. 자료를 조회할 권한이 있다는 이유로 Gemini 전송 권한이 생기지 않습니다.

과거 Git 인증정보 노출 대응은 **별도 미완료 보안 작업**으로 유지합니다. 이번 P1 준비나 카탈로그 비교가 그 작업을 완료시키지 않습니다. MariaDB는 재시작·접속·삭제하지 않습니다.

## 로컬 확인과 아직 미검증인 부분

```powershell
node --test supabase/tests/static-review.test.cjs supabase/verification/schema-compare.test.cjs
node --check supabase/verification/schema-compare.cjs
```

현재 결과: 정적 계약 9개 + 합성 카탈로그 비교기 7개 = **16개 통과, 실패 0개**. 실제 PostgreSQL 문법 파싱/SQL 실행, 기준 환경 생성, Dev 카탈로그 일치, Auth 설정, 사용자 JWT·RLS 실행은 모두 미검증입니다. 모바일 소스·원격 데이터·Vercel·Git 이력은 변경하지 않았습니다.

공식 근거:
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Supabase API 키](https://supabase.com/docs/guides/getting-started/api-keys),
[PostgreSQL 메타데이터 함수](https://www.postgresql.org/docs/current/functions-info.html),
[PostgreSQL SHA-256 함수](https://www.postgresql.org/docs/current/functions-binarystring.html).
# ACL compatibility correction

`catalog-readonly.sql` uses `acldefault('c', owner)` for a NULL column ACL.
A generic SQL empty `aclitem[]` can be zero-dimensional and is rejected by
`aclexplode`; this does not by itself indicate corrupt Dev privileges.
Table/function/schema ACLs are expanded independently with their own defaults.
Explicit empty ACLs are preserved, not replaced with default grants. Actual
malformed stored ACLs still fail rather than being flattened or silently omitted.

Function `config` remains an ordered JSON array (or null), but each entry is now
a SHA-256 fingerprint, never the raw setting. Do not publish snapshots; names and
fingerprints remain private metadata. The root format is unchanged. The query hash
changes, so re-export BOTH the reviewed disposable reference and Dev with this
query; old bound references are intentionally rejected. Never bind Dev as its own
reference or rerun initial migrations against Dev to resolve differences.

Offline source/contract checks:

```powershell
node --test supabase/tests/static-review.test.cjs supabase/verification/schema-compare.test.cjs
node --check supabase/verification/schema-compare.cjs
```

`acl-regression.sql` is an additional real-engine regression with synthetic ACL
values only. In a separately prepared LOCAL disposable PostgreSQL database, run
the complete file using psql `-X -v ON_ERROR_STOP=1 -f` or a local SQL client.
Do not point it at a remote project or supply credentials in CLI arguments.
Expected: 10 rows, all `passed=true`. Repeat on the same major as Dev and any
other supported major being evaluated (14+). These engine checks are separate
from the Node source tests; no local engine execution is implied by a Node pass.
The comparator still returns unverified for a reference/Dev major mismatch.

For the approved manual Dev catalog read, replace the SQL Editor text with the
updated catalog file and run the WHOLE BEGIN-through-ROLLBACK block once. Expect
one `snapshot` cell, preserving the existing root object save format. No migration
or RLS fixture belongs in that Editor run. A schema match never proves user RLS.
