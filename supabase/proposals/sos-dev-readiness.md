# SOS Dev 적용 준비 — 2026-11-05

대상: 사용자가 직접 확인하는 DrMAS-Dev/main. 아직 SOS 적용 승인/원격 실행 없음.

적용 파일: `202611040001_sos_alerts.sql`

SHA-256: `ef48b3c57f98773ee4aa4b8fc74218c7b1291d9dc4c04dbcdf3bba33048fff35`

기존 증거: PostgreSQL 17 별도 55434 클러스터 실제 SOS/RLS/잠금 대기/중복 방지/
기존 RLS/재연결 회귀 검증 PASS, 종료 및 합성 fixture 정리 PASS.
새 테스트 클러스터를 다시 만들거나 같은 검사를 반복하지 않는다.
기존 Dev 재연결 적용/데이터 보존/사용자 보고 A/B/G/H JWT 복약 RLS PASS를 활용한다.
이것은 아직 SOS Dev JWT 또는 두 기기 수신 성공의 증거는 아니다.

## 호환성과 영향

- 의존성은 profiles, care_links, auth.uid(), drmas_private.current_role(),
  drmas_private.can_read_patient(uuid), anon/authenticated/service_role 역할.
- 추가 대상: sos_alerts 테이블, 인덱스 총 4개(PK/UNIQUE 포함), 제약 총 6개,
  RLS 정책 1개, RPC 2개. 새 사용자 트리거는 없다.
- 기존 테이블 데이터, care RPC/정책/GRANT, 연결 상태를 변경하는 SQL은 없다.
  새 테이블의 FK 준비 과정에 profiles 관련 잠금이 생길 수 있다. 한 트랜잭션이며
  lock_timeout 5초, statement_timeout 60초. 조용한 시간에 단 한 번 적용한다.
- 실제 요청/확인 RPC는 profiles/care_links 행을 잠그고 sos_alerts만 쓴다.
- 새 SOS FK는 기본 NO ACTION이다. SOS 이력이 생긴 뒤 해당 profiles/Auth 사용자를
  삭제하려 하면 FK로 막힐 수 있다. 지금 삭제/초기화는 하지 않으며, 계정 삭제와
  SOS 보존/정리 정책은 별도 검토 대상이다. 자동 CASCADE를 추가하지 않는다.
- 신뢰하는 기존 care RPC 소유자와 같은 소유자로 실행한다. 새 함수 PUBLIC/anon
  EXECUTE는 차단하고 authenticated에만 클라이언트 실행을 부여한다.
- 승인된 모든 보호자가 수신 대상이다. G만 승인됐다고 가정하지 말고 합성 A의
  승인 대상 목록을 기존 연결 관리에서 확인한다. H는 미승인 상태여야 한다.
- 보호자 연결 해제 후 서버 조회/확인 차단. 동일 계정 재승인 시 과거 SOS 내역도
  다시 보인다. 현재 동의 기준이며 별도 사용자 인지/승인 대상이다.

## 최소 적용 순서 (현재는 준비만)

1. 원격 실행은 별도 승인 후 사용자가 SQL Editor에서 수행한다. 현재 프로젝트/브랜치,
   테스트 계정, 파일 해시를 확인한다. 기존 A-G 승인 연결을 그대로 둔다.
2. 기존 `verification/reconnect-data-preservation-readonly.sql`과 새
   `verification/sos-deploy-readonly.sql`을 적용 직전에 각각 읽기 전용 실행하고
   서로 다른 비공개 V: 파일로 보관한다. 기존 백업/결과를 덮어쓰지 않는다.
3. 사전 기대: baseline 네 항목 true, PostgreSQL 17, SOS 테이블 false/RPC 0.
   SOS 이름의 객체가 이미 있거나 baseline이 다르면 중단하고 원인을 확인한다.
   보완 SQL은 신속 점검용이다. 기존 구조/권한이 바뀐 흔적이 있으면 기존 전체
   카탈로그로 대조하며 객체 개수만으로 정의가 일치한다고 판정하지 않는다.
4. 정확한 SOS 파일 전체를 실행한다. 파일에 BEGIN/COMMIT이 있으므로 추가로 감싸지
   않는다. 오류는 중단/ROLLBACK. 결과 불명확/COMMIT 이후에는 자동 재실행하지 않는다.
5. 앱 SOS 테스트 전에 두 읽기 전용 SQL을 다시 실행한다. 기존 테이블 지문/건수/연결
   상태별 건수 및 care_closure_fingerprint가 전후 같아야 한다. 이 검사 전에는
   A-G 연결·복약·SOS 조작을 하지 않는다.
6. 사후 기대: table/rls true, columns 6, valid indexes 4, valid constraints 6,
   policies 1, user triggers 0, RPC 2, signature 두 항목 true.
   authenticated SELECT true, direct write false, anon table privilege false.
   RPC마다 security_definer/empty_search_path/same_owner_as_care_rpc/
   authenticated_execute true, anon_execute/public_execute false.
7. 이름/정의/권한은 승인된 SQL과 함께 검토한다. SOS 테이블에 데이터가 아직
   생성되지 않는 것이 정상이며 자료 생성은 다음 사용자 세션 테스트에서만 한다.

## 적용 후 실제 사용자 테스트 (별도 범위 확인 후)

1. A와 G 각각 로그인한 두 기기를 사용한다. 합성 계정만 사용하고 H의 미승인 상태 확인.
2. 두 기기 홈 화면을 전경으로 유지한다. A가 한 번 요청하고 대기 시간을 통과한다.
3. G 홈에서 수동 새로고침 또는 15초 폴링으로 수신, 확인 완료를 누른다.
   A 내역에 해당 보호자의 확인 상태가 반영되어야 한다. 요청 저장만으로 수신/확인
   PASS라 하지 않는다. 폴링은 홈 패널이 열려 있을 때만 동작한다.
4. H 일반 사용자 JWT로 해당 A의 SOS 직접 SELECT가 0행인지 확인한다.
   H 본인 프로필 조회 성공도 확인한다. G의 양성 수신 증거가 선행돼야 한다.
   H의 타인 alert ID 확인은 권한 오류여야 한다(실제 데이터 수정 없음).
   기존 복약 RLS 진단 화면은 SOS 테이블을 검사하지 않으므로 증거로 대신 쓰지 않는다.
5. 연결 해제 후 차단 검사는 A-G 상태를 바꾸므로 현재 준비/상태 유지 범위에서 실행하지
   않는다. 추후 별도 승인 또는 별도 합성 연결로 검증할 때 G의 이미 발급된 세션을
   유지하고 직접 SELECT 0행/확인 거부를 검사한다. 권한 철회와 앱 내 임시 캐시는
   구분한다(최대 다음 새로고침까지 기존 표시가 남을 수 있음).

백그라운드 푸시, 위치·소리·진동, 119 등 외부 긴급기관 신고는 미구현이다.
30초 전송 제한, 통신 실패 시 자동 재전송 없음, 내역 최대 50건 표시 한계가 있다.
기존 암호화 백업은 보존하고 실제 복원 미검증 위험을 유지한다. 추가 백업/복구
자동화를 개발하거나 실행하지 않는다.
