# PostgreSQL/RLS 검증 절차 — 현재 DB 실행 미검증

현재 환경에서는 Docker CLI·서비스 및 PostgreSQL 서버/클라이언트를 찾지
못했다. DB를 설치하거나 컨테이너를 실행하지 않았다. 아래 SQL은 실행
준비물이며 통과한 테스트로 집계하지 않는다.

## 지금 실행할 수 있는 정적 검사

저장소 루트에서:

```powershell
node --test supabase/tests/static-review.test.cjs
```

소스의 테이블명·RLS·권한·제약·search_path 등 계약만 검사한다. PostgreSQL
문법 파서, 실제 쿼리 계획, 권한 실행 결과를 검사하는 엔진은 아니다.

## 선택 사항: 새 로컬 Docker 환경에서 실행 (미실행)

사용자가 Docker를 설치·시작한 뒤 아래 명령을 검토해 직접 실행한다.
기존 동일 이름의 compose 스택이 없는지 먼저 확인한다. 프로젝트 루트 기준이다.

```powershell
docker compose -f supabase/tests/compose.local.yml up -d --wait
docker compose -f supabase/tests/compose.local.yml exec -T db psql -X -U postgres -d drmas_rls_test -v ON_ERROR_STOP=1 -f /work/local_bootstrap.sql
docker compose -f supabase/tests/compose.local.yml exec -T db psql -X -U postgres -d drmas_rls_test -v ON_ERROR_STOP=1 -f /work/migration.sql
docker compose -f supabase/tests/compose.local.yml exec -T db psql -X -U postgres -d drmas_rls_test -v ON_ERROR_STOP=1 -f /work/rls_access.sql
docker compose -f supabase/tests/compose.local.yml down
```

컨테이너는 network_mode:none, 호스트 포트 없음, tmpfs 데이터 폴더로
구성했다. 비밀번호 대신 trust 인증을 쓰는 이유는 이 격리된 컨테이너의
Unix socket 테스트 전용이기 때문이다. 운영·공유 호스트·네트워크 노출
환경에 이 인증 설정을 복사하면 안 된다. down 시 가상 테스트 DB는 사라진다.
이미지 다운로드와 실행은 이번 작업에서 하지 않았다.

PostgreSQL 17은 계획된 대표 버전이며 실제 Supabase 프로젝트 버전과 일치한다고
가정하지 않는다. 필요하면 별도 검토 후 동일 메이저 이미지로 바꿔 검사한다.

## 네이티브 PostgreSQL이 별도로 준비된 경우

다른 DB가 없는 전용 로컬 클러스터와 drmas_rls_test라는 빈 DB를 사용한다.
호스트를 명시적으로 127.0.0.1, 포트를 별도 테스트 포트로 지정하고 같은
순서로 psql -f를 실행한다. 비밀번호를 URL·명령행·PGPASSWORD 값으로
기록하지 말고 필요한 경우 psql -W의 숨김 입력을 사용한다.

local_bootstrap.sql은 새 로컬 DB만을 위한 auth.users/auth.uid/역할 대체물이다.
기존 auth 스키마나 anon/authenticated/service_role 역할이 있으면 중단한다.
기존 Supabase 또는 공유 클러스터에서 실행하면 안 된다. 파일의 로컬 주소와
DB 이름 검사는 실수를 줄이지만 SSH 터널 등의 운영 연결을 허용하는 장치가 아니다.
운영 연결 문자열과 .env를 이 절차에 사용하지 않는다.

## SQL 테스트의 범위

rls_access.sql은 가상 사용자 4명과 두 환자의 가상 일정·기록을 만들고
53개 명시적 assertion을 준비했다. 일반 SELECT 결과를 owner로 보는 대신
SET LOCAL ROLE anon/authenticated와 가상 sub로 실제 RLS를 검사한다.
보조 assertion 함수도 SECURITY INVOKER여서 owner 권한으로 우회하지 않는다.

SELECT 차단은 권한 오류 또는 0행, UPDATE/DELETE 차단은 명령 종류에 따라
권한 오류 또는 영향 0행이 정상이다. 단순히 SQL 문이 오류 없이 실행됐다는
이유로 다른 환자 데이터 변경이 허용됐다고 판단하지 않는다.

테스트용 sub 설정은 신뢰된 관리자 연결에서만 사용한다. 실제 클라이언트가
JWT를 위조할 수 있음을 뜻하지 않으며 JWT 서명·PostgREST 역할 전달·메일
인증은 이 대체 환경에서 검증하지 않는다. 마이그레이션은 별도 트랜잭션으로
유지하고 테스트 fixture·도우미만 최종 ROLLBACK으로 제거한다. ON_ERROR_STOP과
psql 종료 코드, 모든 assertion의 PASS 및 실패가 없는지를 확인한다.

새로 추가한 timezone/identity 트리거, 실제 권한, PL/pgSQL 컴파일,
INSERT ON CONFLICT, FK 오류 코드 등도 아직 실제 엔진에서 미검증이다.
실패하면 기대값을 완화해 숨기지 말고 원인을 확인한다.

## 실제 Supabase 검증으로 남은 항목

별도 승인된 개발 프로젝트에서 실제 Auth 테스트 사용자·JWT·publishable key로
같은 접근 행렬을 HTTP Data API/RPC로 다시 검증해야 한다. service_role이나
SQL Editor owner로 읽은 결과는 일반 사용자 RLS의 검증 결과가 아니다.
preflight_readonly.sql은 승인된 적용 전후 메타데이터/건수 확인용이며 이번에는
실행하지 않았다. local_bootstrap.sql과 현재의 고정 DB 이름 SQL 테스트는
Supabase SQL Editor에 붙여 넣지 않는다.

백업·복구·미검증 위험은 [검토 보고서](../../docs/supabase-rls-review.md)를 참고한다.
