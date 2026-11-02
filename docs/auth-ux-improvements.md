# 인증 입력과 사용자 안내 개선

작성일: 2026-11-01 · DrMAS-Mobile

## 변경과 보존 범위

- AuthScreen.tsx: 비밀번호/확인란 각각 보기·숨기기, 버튼 라벨·힌트·선택/비활성 상태,
  44 높이, 이름→이메일→비밀번호→확인 포커스 이동과 마지막 완료 제출을 추가했다.
  이메일·비밀번호 자동완성과 자동 대문자/교정 억제 속성을 지정했다.
- components/ui.tsx: Field에 타입이 맞는 inputRef와 기본 접근성 라벨을 추가했다.
- app/index.tsx, useDrMASController.ts: 앱 시작의 세션 복원과 이후 제출 중 상태를
  구분한다. 제출 때 AuthScreen을 전체 spinner로 교체하지 않으며 폼은 유지하고 잠근다.
  authBusy ref의 중복 제출 방지와 서버 프로필/역할 검증은 유지했다.
- auth.ts: PROFILE_SCHEMA/PROFILE_PERMISSION의 사용자 문구를 자연스럽게 바꿨다.
  오류 코드·조회/권한 확인 로직은 그대로다.
- WelcomeScreen.tsx: UI 체험/체험용 UI 문구를 계정 선택/일부 서비스 준비 안내로 바꿨다.
- ServicesScreen.tsx, GuardianHome.tsx: UI/API 구현 설명을 미제공 서비스 안내로 바꿨다.
- PatientHome.tsx: SOS 체험 표현을 이 기기에서만 상태가 바뀐다는 안내로 바꿨다.
- controller의 고정 AI 응답도 API 설명 대신 자동 의료 상담 미제공을 안내한다.
- scripts/test-auth-ux.cjs 추가, test-auth-integration.cjs의 이메일 확인 안내 검증을
  authError 대신 authNotice에 맞췄다. package.json에 test:auth-ux 명령을 추가했다.

로컬 복약 저장 서비스·사용자 ID/날짜 분리·읽기/쓰기 실패 보호·이전 요청 차단은
바꾸지 않았다. SQL/RLS, 원격 DB, API 키, 실제 .env도 바꾸지 않았다.
키·비밀번호·토큰을 출력하거나 기록하는 코드를 추가하지 않았다.

## 가입 성공과 서비스 이용 정보 실패

현재 경로는 signUp → getUser → profiles SELECT다. 모바일이 profiles를 저장하다가
실패하는 흐름은 아니다. 사용자 보고의 PGRST205/404는 프로필 조회 단계에서 발생한다.
마이그레이션 미적용 가능성은 있으나 이 작업에서 원격 DB를 확인하거나 확정하지 않았다.
프로젝트 일치 여부·마이그레이션 상태·스키마 캐시는 별도 확인 대상이다.

서버가 signUp 결과를 정상 반환했으나 계정/프로필 후속 확인이 실패하면:

1. 대시보드 진입과 사용자 권한은 계속 차단한다.
2. 입력 화면은 로그인으로 전환한다. 비밀번호와 확인란은 지운다.
3. 가입 요청 처리 안내(authNotice)와 실제 이용 정보 오류(authError)를 분리한다.
4. 같은 화면에서 회원가입을 다시 권하는 버튼 대신 기존 계정 로그인/다른 계정 사용을 제공한다.
   컨트롤러도 처리된 가입의 반복 submit을 차단한다. 다른 계정 사용은 기존 로그아웃을 거친다.
5. 이메일 확인 대기도 오류 빨간 문구가 아닌 정보 안내로 표시한다. 이 응답은 중복 가입
   보호로 모호할 수 있으므로 계정이 반드시 새로 생성됐다고 단정하지 않는다.
6. 앱 재시작 때 저장된 세션은 유효하지만 프로필 조회가 실패한 경우에도 다시 가입할
   필요가 없다는 안내와 로그인 흐름을 제공한다. 프로필을 생성하거나 권한을 추정하지 않는다.

가입 상태 표시는 메모리 상태이며 이메일·비밀번호를 별도 저장하지 않는다.
화면을 우회해 가입 버튼을 누르는 경우도 signupProcessed 상태에서는 API 재호출을 막는다.
서버 연결 오류로 가입 결과 자체를 알 수 없는 경우에는 성공했다고 표현하지 않는다.

## 입력 보존·보안·키보드

일반 가입/로그인 실패 시 이름·이메일·비밀번호·확인 입력을 메모리에 유지한다.
비밀번호 표시는 제출 시작 때 다시 숨기며, 앱이 active 상태를 벗어나도 두 표시를 숨긴다.
성공·이메일 확인 단계·가입 후 후속 오류·모드 전환·뒤로가기·검색 화면 이동·
로그아웃/세션 종료 시에는 비밀번호를 지운다. AsyncStorage에 자격 증명을 쓰지 않는다.

iOS padding/Android height KeyboardAvoidingView와 스크롤, 드래그 시 키보드 닫기,
하단 여백을 적용했다. 다음 키는 ref로 다음 입력에 포커스를 주고, 완료/제출은
키보드를 닫은 뒤 기존 submitAuth를 호출한다. 자동완성은 autoComplete를 사용한다.
이는 native 키보드·자동완성의 실제 품질 보장이 아니며 기기 확인이 필요하다.

## 자동 검증과 한계

mobile에서 실행:

```powershell
node --test scripts/test-auth-ux.cjs scripts/test-places.cjs scripts/test-local-data.cjs scripts/test-auth.cjs scripts/test-auth-integration.cjs scripts/test-supabase.cjs
npx.cmd --no-install tsc --noEmit
$env:EXPO_NO_DOTENV = '1'
npm.cmd run lint
```

기존 75건 + 신규 8건 = 83건 통과, TypeScript·lint 통과.
테스트는 가상 계정/서비스와 element props/hook 하네스이며 실제 비밀번호·API 호출을 사용하지 않는다.
입력 보존·가입 후 프로필 오류·중복 가입 차단·이메일 확인·복원 실패·중복 제출·
포커스 이벤트·자동완성/비활성/접근성 속성·미완성 기능 문구를 검사했다.
실제 Android/iOS 키보드·TalkBack·패스워드 매니저·원격 가입은 미검증이다.

## 실제 기기 확인 절차와 남은 문제

1. 테스트 계정으로 로그인/가입 화면에서 다음 키가 각 입력을 순서대로 이동하는지 확인한다.
2. 작은 화면·큰 글꼴에서 비밀번호 확인과 제출 버튼까지 스크롤할 수 있는지 확인한다.
3. 각 보기/숨기기 버튼이 독립적으로 동작하고 입력값·커서·자동완성이 유지되는지 확인한다.
   앱을 백그라운드로 보냈다가 돌아와 두 값이 다시 가려지는지도 확인한다.
4. 연결 오류 후 입력이 보존되고 완료 키/버튼 연속 입력이 한 요청만 만드는지 확인한다.
5. 가입 후 프로필 오류에서는 로그인 화면·처리 안내·관리자 확인 안내가 나오고,
   반복 회원가입이나 미검증 홈 진입이 일어나지 않는지 확인한다.
6. 로그아웃→다른 계정에서 복약·채팅·SOS·비밀번호가 남지 않는지 기존 절차도 반복한다.

원격 환경 문제는 이 UI 변경으로 해결되지 않는다. profiles 준비/승인된 DB 검증은
별도 작업으로 남는다. 비밀번호는 재입력을 줄이기 위해 오류 후 메모리에 남으므로
공용 기기에서는 사용자가 화면 이동/로그아웃으로 정리해야 한다. Native 보안 입력의
보기 전환 시 커서 위치, Android 키보드 resize, TalkBack 읽기 순서도 실제 확인이 필요하다.
이번 작업에서 원격 SQL·배포·Git commit/push는 수행하지 않았다.

참고: [RN 입력](https://reactnative.dev/docs/textinput),
[키보드 회피](https://reactnative.dev/docs/keyboardavoidingview),
[스크롤](https://reactnative.dev/docs/scrollview).
