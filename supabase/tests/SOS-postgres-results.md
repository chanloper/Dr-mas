# SOS PostgreSQL 17 실행 검증 (2026-11-04)

실행기: `supabase/tests/sos-postgres.cjs`

```powershell
Set-Location C:\MAS\Dr-mas
node supabase/tests/sos-postgres.cjs
```

PostgreSQL 17 실행 파일은 기본적으로 `C:\Program Files\PostgreSQL\17\bin`을
사용한다. 필요한 경우 DRMAS_PG_BIN으로 로컬 실행 파일 경로만 지정한다.
비밀번호·서비스 연결 문자열을 사용하지 않는다.

실행마다 OS 임시 폴더에 새 클러스터를 생성하고 `127.0.0.1:55434/drmas_sos_test`만
사용한다. 기존 55432 클러스터 및 Supabase에는 접속하지 않는다. 포트가 사용 중이면
중단한다. 임시 경로에는 합성 자료만 존재하며 기존 파일은 삭제하지 않는다.
임시 클러스터는 테스트 종료 시 정지한다. 초기화 --no-sync는 일회용 합성 환경의
속도 설정이며 충돌 복구·백업 내구성 검증을 의미하지 않는다.

## 실제 실행에서 확인한 항목

- 초기 Auth/care 스키마와 기존 RLS 실행 검사 PASS.
- 초기 스키마에 SOS SQL 적용 PASS: 재연결 SQL에 대한 선행 의존성 없음.
- 환자 A와 승인된 보호자 G만 A의 SOS 조회 가능, 대기 보호자 H 및 다른 환자 B 차단.
- 환자/보호자 역할별 RPC 제한, 미인증 역할과 사용자 식별자 없는 요청 차단.
- 타인의 SOS ID 확인 차단, 환자의 확인 시도 차단.
- 직접 INSERT/UPDATE/DELETE 권한 차단.
- 승인된 보호자 확인 성공, 중복 확인 시 최초 확인 시각 보존.
- 연결 해제 후 이전 보호자 조회·확인 차단.
- 보호자 없는 요청 실패, 30초 내 중복 전송 차단.
- SOS 적용 후 기존 가입 트리거·복약·연결 RLS 회귀 검사 PASS.
- SOS 적용 뒤 재연결 마이그레이션과 기존 단일 세션 재연결 통합 검사 PASS.
- 실제 두 세션 동시 전송: pg_stat_activity에서 잠금 대기를 관측,
  한 전송만 성공하고 다른 전송은 P0001 제한, 최종 SOS 수 1건.
- 실제 두 세션 동시 확인: 잠금 대기를 관측, 두 호출 종료 성공, 확인된 행 1건.
- 합성 fixture 정리 후 profiles 잔여 0건 확인.

첫 시도에서는 제한된 실행 환경의 WAL 파일 이름 변경 권한 때문에 초기화 실패.
별도 로컬 실행 권한으로 진행했다. 후속 실행 중 테스트 러너의 JavaScript 문자열
치환이 PostgreSQL dollar quote를 변형하는 오류를 수정하고 전체 실행을 다시 통과했다.
SOS SQL 자체 및 기존 초기·재연결 SQL은 이 검증에서 변경하지 않았다.

## 보장하지 않는 범위

authenticated/anon 역할과 합성 auth.uid()를 이용한 실제 PostgreSQL 권한 검사다.
Supabase Auth의 JWT 서명·만료·갱신, PostgREST 전달, 실제 기기 간 연결은 미검증이다.
사용자 식별자 없는 요청 차단을 실제 만료 JWT 검증 PASS로 해석하지 않는다.
이번 테스트는 백업 복구 검증도 아니다.

모바일 `request_sos_alert()` → integer, `acknowledge_sos_alert(alert_id uuid)` → void
계약은 Mock 실행 검사와 일치한다. API 서버 경유 실검증은 Dev 승인 후 필요하다.

## Dev 적용 전 남은 최소 조건

1. 최신 백업의 종료 코드·체크섬·아카이브 검증 기록 확인, 실제 복원 미검증 위험 유지.
2. 기존 재연결 SQL과 새 SOS SQL을 구분해 정확한 파일에 대한 별도 적용 승인.
3. 신뢰하는 함수 소유자, PUBLIC/anon RPC 실행 차단, authenticated SELECT만 부여,
   API 노출 설정과 적용 직후 데이터 보존 확인.
4. 합성 A/B/G/H 실제 JWT로 동일 권한 경계 검사 및 두 기기 요청→수신→확인.
5. 재승인 후 과거 SOS 내역도 다시 보이는 현재 동의 기준에 대한 승인 확인.
   백그라운드 푸시·119 신고는 구현 범위에 포함되지 않는다.
