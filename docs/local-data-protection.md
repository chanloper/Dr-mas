# 모바일 로컬 데이터 보호 변경 기록

작성일: 2026-11-01 · DrMAS-Mobile

## 범위와 변경 파일

이번 변경은 사용자 ID별 로컬 복약 기록과 계정 전환 시 메모리 정리에 한정한다.
실제 기기 저장소·개인 기록·.env를 열람하거나 수정하지 않았다. 테스트의 기록과
계정은 모두 프로세스 내부 가상 데이터다. 원격 Supabase/Cloudtype/SQL 실행,
서버 실행·배포·Git commit/push는 하지 않았다. 기존 작업 트리의 다른 변경은 보존했다.

| 파일 | 변경 |
| --- | --- |
| mobile/src/services/localMedications.ts | 사용자 ID·날짜 키, 읽기/파싱/쓰기 오류 분리, 키별 비동기 직렬화 |
| mobile/src/features/app/useDrMASController.ts | 인증 전 표시 차단, 명시적 변경만 저장, 오래된 요청 차단, 공통 세션 정리 |
| mobile/src/components/MedicationStatus.tsx | 로딩·저장 중·오류·재조회 표시를 두 화면에서 공유 |
| mobile/src/components/ui.tsx | MedicineRow의 disabled 및 접근성 상태 추가 |
| mobile/src/screens/PatientHome.tsx | 공통 저장 상태 표시·변경 중 체크 차단 |
| mobile/src/screens/MedicationScreen.tsx | 동일한 상태·재조회 제공, 빈 목록의 0분모 방지 |
| mobile/scripts/controller-harness.cjs | 기존/신규 테스트가 공유하는 가상 hook·저장소·타이머 하네스 |
| mobile/scripts/test-auth-integration.cjs | 기존 검증을 공통 하네스로 실행하도록 연결, 기존 검증 항목 유지 |
| mobile/scripts/test-local-data.cjs | 장애·지연·계정 전환·보존·메모리 정리 테스트 |
| mobile/package.json | test:local-data 명령 추가, 의존성 변경 없음 |
| docs/local-data-protection.md | 본 변경·검증·기기 확인 절차 |

## 저장·조회 경로 조사와 변경

변경 전 실제 복약 AsyncStorage 읽기/쓰기는 useDrMASController의 loadDay와
자동 저장 effect 두 곳에 있었다. 환자 홈/복약 화면의 MedicineRow가 컨트롤러
toggleMedication을 호출했다. 로그인 여부와 관계없이 날짜 키를 읽고 effect로 저장했다.
AI와 SOS는 메모리만 사용하며, 인증 토큰은 별도의 SecureStore 경로다.
services/medications.ts의 Supabase 서비스는 로컬 저장소 경로가 아니며 이번에 연결하지 않았다.

변경 후 경로:

1. 서버 검증을 마친 AuthUser.id를 받은 다음 해당 계정의 복약 기록만 읽는다.
2. controller → localMedications.read → AsyncStorage.getItem으로 조회한다.
3. 사용자가 체크를 바꿀 때만 controller → localMedications.write → setItem으로 저장한다.
4. 성공 응답 후에 체크 상태를 화면에 반영한다. 저장 중 추가 체크는 막는다.
5. 로그아웃·SDK SIGNED_OUT·다른 사용자 수락 시 공통 함수가 메모리와 요청 세대를 정리한다.

새 키 형식은 `drmas.medication.v2.<encodeURIComponent(userId)>.<YYYY-MM-DD>`다.
실제 사용자 ID를 사용하며 role·이메일·표시 이름으로 분리하지 않는다.
초기 조회나 날짜 변경만으로 빈 값을 쓰지 않는다. 현재 일정에 표시되지 않는
기존 문자열 ID도 명시적 체크 변경 시 보존한다.

## 실패와 비동기 요청 처리

- 읽기 실패: READ 오류. 목록은 미준비 상태이며 쓰기를 허용하지 않는다.
- JSON/데이터 형식 실패: PARSE 오류. 원문은 유지하며 빈 배열로 대체 저장하지 않는다.
- 쓰기 실패: WRITE 오류. 마지막 확인된 표시 상태를 유지하고 추가 편집을 막는다.
  사용자가 ‘기록 다시 확인’을 눌러 성공적으로 읽은 뒤에만 다시 편집할 수 있다.
- 실패한 쓰기의 실제 반영 여부가 불확실해도 자동 rollback/재저장하지 않는다.
  재조회로 저장소의 실제 상태를 확인한다.
- 읽기/쓰기 결과는 사용자 ID뿐 아니라 요청 세대와 현재 record 객체를 검사한다.
  A→B→A처럼 ID가 다시 같아져도 이전 요청은 무시한다. 오래된 오류도 새 화면에 표시하지 않는다.
- 같은 키의 작업은 controller remount를 포함해 모듈 단위로 직렬화한다.
  이전 쓰기가 완료되기 전에 같은 키를 읽어 오래된 값을 로드하는 것을 막는다.
- 아직 실행되지 않은 오래된 쓰기는 건너뛴다. 이미 native setItem에 전달한 쓰기는
  취소할 수 없지만 원래 계정·날짜 키에만 영향을 주며 새 계정 UI는 변경하지 않는다.
- 날짜 변경은 기존 record를 즉시 무효화한다. 전날 체크를 새 날짜에 복사하지 않는다.

## 인증 경계의 메모리 정리

수동 로그아웃, 서버 로그아웃 실패, SDK SIGNED_OUT, 새 사용자 수락에서 공통으로
복약 목록/준비/오류/저장 상태, 채팅 입력·대화·메시지 번호, SOS 카운트다운·알림·확인·
지연시간, 이름·이메일·비밀번호·비밀번호 표시 상태·탭·역할 초기화를 수행한다.
사용자 수락 시 검증된 프로필 값으로 계정 정보를 다시 채운다.
세션이 바뀐 뒤의 이전 SOS 콜백도 요청 세대 검사로 무시한다.
디스크의 복약 기록은 로그아웃 때 지우지 않는다.

## 기존 기록 보존과 남은 작업

기존 `drmas.medication.v1.<date>`는 소유자를 증명할 정보가 없다. 이번 코드에서는
읽기·삭제·자동 복사·새 계정 귀속을 하지 않는다. 따라서 새 화면에 과거 날짜별
체크가 보이지 않아도 원본을 삭제한 것은 아니다. 기존 계정/백업 정합성을 확인하고,
사용자 확인·미리보기·충돌 정책·복구 절차를 갖춘 별도의 이전 작업이 필요하다.
이전 승인 UI는 이번에 추가하지 않았다.

남은 한계:

- AsyncStorage는 암호화 저장소가 아니다. 계정별 키 분리는 앱의 표시/저장 경계이며
  탈옥·루팅·물리적 저장소 열람에 대한 암호화 대책은 아니다. 인증 세션의 SecureStore는 유지한다.
  [Expo SDK 58 AsyncStorage 설명](https://docs.expo.dev/versions/v58.0.0/sdk/async-storage/)
- native 저장소의 전원 손실·디스크 손상에 대한 트랜잭션/복구 보장은 추가되지 않았다.
- 키별 큐는 현재 JavaScript 런타임 안에서 동작한다. 여러 독립 런타임/프로세스의
  동시 쓰기를 지원하는 DB 트랜잭션은 아니다. 처리 중인 저장소 작업이 영원히
  응답하지 않는 경우 timeout/복구 방식도 후속 설계 대상이다.
- 자정의 첫 체크는 날짜 갱신을 위해 소비될 수 있다. 갱신 후 다시 체크해야 한다.
- 복약 일정은 여전히 예시 3개이며 클라우드 동기화·보호자 원격 조회는 이번 범위 밖이다.
- 보호 테스트는 가상 hook 하네스다. 실제 React renderer/StrictMode·Android native
  저장소·실제 Supabase 세션 전환을 검증했다는 뜻은 아니다.

## 자동 검증

mobile 폴더에서 실행:

```powershell
node --test scripts/test-local-data.cjs scripts/test-auth.cjs scripts/test-auth-integration.cjs scripts/test-supabase.cjs
npx.cmd --no-install tsc --noEmit
$env:EXPO_NO_DOTENV = '1'
npm.cmd run lint
```

로컬 보호 테스트 20건과 기존 모바일 회귀 36건, 합계 **56건 통과**.
TypeScript·lint 통과. 앱/테스트 코드에 새로운 로깅이나 외부 요청을 넣지 않았다.
테스트의 READ/PARSE/WRITE 장애, 저장 결과 불확실성, 지연 성공/실패,
A→B→A, 요청 도중 unmount, 로그아웃 실패, 늦은 SOS 콜백을 검증했다.
실제 기기·원격 DB 검증은 미실행이다.

## Android 수동 확인 절차

실제 개인 기록이 없는 분리된 기기/프로필과 가상 테스트 계정을 사용한다.
기존 앱 데이터 삭제·저장소 초기화·운영 DB 변경으로 시험 환경을 만들지 않는다.
승인된 테스트 계정과 프로필이 아직 준비되지 않았다면 로그인 이후 검증은 대기로 기록한다.
이 작업을 위해 원격 SQL이나 계정을 임의로 생성하지 않는다.

1. `mobile`에서 기존 환경 설정으로 `npx.cmd expo start --clear`를 실행하고
   Android Expo Go로 연다. 로그인 확인 전 대시보드/이전 기록이 보이지 않아야 한다.
2. 동일 역할의 계정 A로 로그인한다. 로딩 중 체크가 허용되지 않는지 확인하고,
   한 항목 체크 후 저장 완료를 기다린다. 앱 종료/재시작 후 A의 체크만 복원되는지 확인한다.
3. 채팅을 보내고 미전송 입력도 남긴다. SOS를 시작한 후 로그아웃한다.
   A의 이름/이메일·채팅·체크·SOS 상태가 로그인 화면이나 이후 계정 B에 나타나지 않아야 한다.
4. B는 다른 항목을 체크한다. B→A→B로 다시 로그인해 두 계정의 체크가 각각 유지되고
   채팅·SOS 상태는 매번 새로 시작하는지 확인한다. 서버 역할이 같아도 분리돼야 한다.
5. SOS가 만료돼 확인 상태가 생긴 경우와 만료 전 로그아웃하는 경우를 각각 확인한다.
   로그아웃 후 대기해도 다른 계정에서 이전 알림이 생기지 않아야 한다.
6. 앱을 전날 기록 상태로 두었다가 다음 날 다시 활성화한다. 전날 체크가 복사되지
   않고 새 날짜 기록을 불러온 뒤 체크를 바꿀 수 있어야 한다.
7. READ/PARSE/WRITE 실패·느린 A 요청·SIGNED_OUT 이벤트는 현재 자동 하네스에서
   주입한다. 기기에서도 확인하려면 별도 테스트 빌드에 가상 저장소/인증 어댑터를 주입해
   같은 시나리오를 반복한다. 실제 기록을 손상시키거나 토큰을 출력해 재현하지 않는다.
   앱에 장애 주입 메뉴나 가짜 로그인 경로는 추가하지 않았다.

각 결과는 통과/실패/미실행으로 남기고 이메일·사용자 ID·토큰·저장소 원문은
스크린샷/로그/보고서에 포함하지 않는다.
