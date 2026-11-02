# Supabase 설정 누락 오류 진단과 보완

검증일: 2026-11-01 (Asia/Seoul), 브랜치: DrMAS-Mobile

## 확인한 사실

- mobile/.env는 정확한 위치에 존재하고 Git에서 제외되며 추적되지 않는다.
- 두 변수 이름은 EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY로 서비스와 일치한다.
- 두 값은 비어 있지 않으며 HTTPS 프로젝트 origin과 publishable 접두사
  검사를 통과했다. 값·전체 URL·키·연결 문자열은 기록하지 않는다.
- 인코딩 BOM 문제나 우선순위가 높은 .env.local/.env.development 파일은
  발견하지 않았다. 검사 프로세스에는 dotenv/클라이언트 주입을 끄는 변수가 없다.
  기존 실행 중인 Metro의 환경변수 전체를 덤프하지는 않았다.
- 참조는 process.env.EXPO_PUBLIC_변수명 형태의 정적 속성 접근이다.
  설치된 SDK 58의 실제 변환 결과도 expo/virtual/env 참조를 확인했다.
- 설치된 @expo/env 로더는 mobile을 루트로 하면 .env와 두 값을 정상적으로
  읽는다. 저장소 루트를 사용하면 읽지 못한다. 반드시 mobile에서 실행해야 한다.
- 확인된 두 프로세스는 npx 실행 래퍼와 8081 Metro이며 별도 서버 2개가 아니다.
  Metro는 .env 저장 이후 시작됐다. 실제 로컬 Metro의 환경변수 번들에도
  파일과 동일한 두 값이 포함돼 있었다.
- 사용자 환경은 Android Expo Go이며 전체 재접속 후에도 같은 오류가 있었다.

## 원인 범위와 한계

오류 문자열은 Supabase 원격 응답이 아니라 getSupabaseClient의 초기
설정 검사에서 발생한다. 즉 SDK 회원가입 요청 이전에 앱이 읽은 URL/키 중
하나가 비어 있다고 판단한 것이다. 서비스 경로는 submitAuth → register →
getSupabaseClient → SDK signUp이다. 가입 화면 표시만으로 SDK가 생성되지는 않는다.

서버 쪽 파일 로딩과 번들에 값이 있는 것은 확인했지만 휴대폰의 JS 런타임
값을 직접 읽지 못했다. 캐시, 다른 연결, SDK 결함 중 하나로 확정하지 않는다.
env: load 메시지 부재만으로 로딩 실패를 단정하지 않는다. 설치된 Expo CLI는
로그 축소·silent 설정에서 해당 메시지를 생략할 수 있다.

## 최소 보완

- mobile/app.config.ts를 추가해 기존 app.json을 유지하면서 공개 설정
  두 항목만 extra.supabase에 전달한다. process.env 전체를 내보내지 않는다.
- services/supabase.ts는 정적 환경변수의 완전한 쌍을 우선 사용하고,
  런타임에서 누락됐으면 Constants.expoConfig.extra의 완전한 쌍을 사용한다.
  서로 다른 소스의 URL과 키를 섞지 않는다. 두 경로 모두 HTTPS·공개 키
  검증을 동일하게 적용하고, 누락 시에는 여전히 실패한다.
- expo-constants는 이미 설치된 의존성을 사용했다. SDK 업데이트, 별도
  dotenv 주입 라이브러리, 임의 서버 주소나 인증 성공 fallback을 추가하지 않았다.
- 실제 Expo config와 8081의 Android용 manifest에서도 두 값의 존재와
  파일과의 일치 여부만 검사했다. 기존 플러그인 3개·아이콘·스킴이 유지된다.

이는 공개 URL/publishable key 전용 경로다. extra는 클라이언트에서 읽을 수
있으므로 DB_PASS, SESSION_SECRET, sb_secret_ 및 service_role은 넣지 않는다.

## 다시 실행

기존 Expo 터미널에서 Ctrl+C로 종료한 후:

```powershell
cd C:\MAS\Dr-mas\mobile
npx.cmd expo start --clear
```

Android Expo Go를 완전히 종료하고 위 명령이 새로 표시한 QR로 다시 접속한다.
전체 앱 데이터를 지우거나 키를 채팅에 보내지 않는다. Expo 서버의 설정 변경과
manifest를 확실히 다시 받기 위해 Fast Refresh만으로 대체하지 않는다.

설정 오류가 사라진 뒤 서버 인증·이메일 확인·프로필 오류가 나오면 다음
단계의 별도 문제다. 원격 마이그레이션을 적용하지 않은 상태라면 프로필
조회가 실패할 수 있다. 이번 작업에서는 이를 우회하거나 SQL을 실행하지 않았다.

## 검사

관련 테스트는 설정 누락, manifest 경로, 소스 혼합 방지, 비공개 키 거부,
공개 항목 allowlist와 기존 설정 보존을 포함한다. 실제 Supabase 요청은 하지
않고 대체 SDK를 사용한다. 모바일 TypeScript·lint 검사도 실행했다.
최종 결과는 모바일 테스트 31/31 통과, TypeScript·lint·git diff --check 통과다.

.env 수정, 실제 URL/키 출력, UI·복약·AI·SOS 변경, 원격 Supabase/Cloudtype
DB 변경, 배포, Git commit/push는 하지 않았다. 실제 휴대폰에서 보완 후
성공 여부는 재시작 후 추가 확인이 필요하다.

공식 문서: [Expo 환경변수](https://docs.expo.dev/guides/environment-variables/),
[앱 설정과 Constants.expoConfig](https://docs.expo.dev/workflow/configuration/).
