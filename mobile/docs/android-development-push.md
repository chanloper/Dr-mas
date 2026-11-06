# Android 푸시 수신 기반 준비

## 이번 단계에서 준비한 것

- SDK 58 공식 Expo 설치기로 expo-notifications ~58.1.8,
  expo-dev-client ~58.0.18 설치, package-lock 갱신.
- 기존 Expo 인증 상태 파일에는 계정 정보가 존재한다. 내용/토큰/계정명은 출력하지
  않았고 원격 계정 유효성이나 프로젝트 소유 권한은 아직 확인하지 않았다.
- 기존 app.json/app.config.ts, EAS 설정/네이티브 프로젝트 검색에서 현재 앱의
  Android package와 EAS projectId를 찾지 못했다. 원격에 기존 프로젝트가 없다는
  뜻은 아니다. eas.json은 이번에 development 프로필만 추가했다.
- 알림 플러그인을 추가하되 기존 플러그인 옵션은 보존한다. google-services 파일이나
  패키지명, projectId는 임의로 생성하지 않는다. EAS_BUILD 환경에서 식별자가 없으면
  빌드를 중단한다. 로컬 Expo Go 실행은 식별자가 없어도 그대로 가능하다.

## 식별자 결정 (사용자)

1. 기존 Expo/EAS 계정 Dashboard에서 이 앱의 기존 프로젝트가 있는지 확인한다.
   있으면 동일 owner/slug/projectId와 Android package를 재사용한다. 변경하지 않는다.
2. 새 패키지가 꼭 필요할 경우 후보는 `com.<소유자>.drmas.dev` 같은 개발용 구분이다.
   실제 소유자와 기존 앱/Play Console/Firebase 연관 여부를 확인해 확정한다.
   이 후보는 설정에 적용하지 않았다.
3. 확정된 값을 app.json의 android.package와 extra.eas.projectId에 반영하거나,
   로컬 비공개 환경의 DRMAS_ANDROID_PACKAGE / DRMAS_EAS_PROJECT_ID로 제공한다.
   기존 설정과 환경 입력이 다르면 오류로 중단한다. EAS worker에서도 같은 값이 필요하다.
   projectId는 실제 EAS 프로젝트 UUID이며 임의 UUID를 발급해 대체하지 않는다.

## 사용자 휴대전화의 개발 전용 확인 UI

기존 development 환경과 Supabase 설정을 유지하고 PowerShell에서:

```powershell
Set-Location C:\MAS\Dr-mas\mobile
$env:EXPO_PUBLIC_NOTIFICATION_DIAGNOSTICS = '1'
npm.cmd start -- --go
```

아직 Expo Go로 기존 기능을 검사할 때는 --go를 명시한다. dev-client 설치로 Expo CLI의
기본 실행 대상이 달라질 수 있다. RLS 진단 플래그는 별도이며 기존 값을 유지한다.
휴대전화 설정 → **Android 알림 상태 확인**을 누른다.
__DEV__ + APP_ENV=development + 위 플래그=1일 때만 패널이 보인다.

표시 내용은 실행 환경, 패키지/project 설정 유무, FCM 파일 경로 설정 유무,
현재 권한/재요청 가능 상태, 토큰 미발급·서버 등록 미구현뿐이다.
Expo Go/web에서는 expo-notifications를 동적으로 가져오거나 권한 API를 부르지 않는다.
Android 실기기 개발 앱에서는 getPermissionsAsync만 호출한다. 권한 팝업,
토큰 발급, DB 저장, 외부 푸시/로컬 테스트 알림은 실행하지 않는다.
FCM 파일 경로가 보이더라도 파일/서버 자격증명의 유효성을 증명하지 않는다.

## 외부 설정과 다음 승인 범위

- Expo/EAS 계정·기존 프로젝트 확인과 연결. 현재 EAS CLI는 PATH에서 확인되지 않았다.
  CLI 설치/로그인/프로젝트 연결은 별도 단계에서 사용자 조작으로 진행한다.
- Firebase Android 앱의 package를 동일하게 등록. google-services.json 연결과
  FCM v1 서비스 계정 권한/자격증명을 EAS에 안전하게 등록한다.
- FCM 서비스 계정 개인키 파일은 코드/EXPO_PUBLIC_/Git/로그에 넣지 않는다.
  외부 자격증명 업로드는 별도 승인 전 수행하지 않는다.
- 개발 빌드가 기존 Supabase Dev URL/Publishable Key/예상 ref를 사용하도록 EAS의
  development 환경에 필요한 공개 설정만 준비한다. 관리자 키를 앱에 넣지 않는다.
- 이후 승인된 빌드 명령은 `eas build --platform android --profile development`.
  이번 작업에서 실행하지 않았다. APK 설치 후 `npm.cmd start -- --dev-client`.
  네이티브 알림 설정/FCM 파일이 바뀌면 앱을 다시 빌드해야 한다.

## 이번 단계가 구현하지 않는 것

토큰 발급·사용자별 서버 등록/로그아웃 해제·발송 대기열·서버 발송·알림 클릭 이동은
후속 단계다. 토큰은 향후 실제 Supabase 사용자 인증으로 소유자를 검증하고,
다른 사용자 조회를 막으며 계정 전환/만료를 처리해야 한다.
현재 SOS 전경 폴링과 기존 JWT/RLS 진단은 유지한다. 119 자동 신고는 없다.
이번 준비 완료를 실제 원격 푸시 수신 성공으로 판정하지 않는다.

공식 근거:
- https://docs.expo.dev/versions/v58.0.0/sdk/notifications/
- https://docs.expo.dev/build/eas-json/
- https://docs.expo.dev/push-notifications/fcm-credentials/

원격 DB 변경/빌드/자격증명 생성·업로드/알림 발송/Git Commit·Push·배포 없음.

## 2026-11-06 기존 EAS 연결 확인

사용자가 기존 프로젝트에 eas init으로 연결했고 slug 변경을 승인했다.
현재 app.json 및 app.config.ts의 실제 public config 해석 결과는 다음과 일치한다.

- owner: kang21-71607871s-team
- slug: dr-mas-mobile
- projectId: 94d68c0e-f0cd-48f8-9d7e-1e89b8b8c347

동적 config는 정적 config를 보존하므로 같은 값을 중복 하드코딩하지 않았다.
위 연결을 유지하는 오프라인 회귀 검사를 추가했다. 새 EAS 프로젝트는 만들지 않았다.

Android package는 여전히 미설정이다. `com.drmas.mobile`은 문법상 가능한 후보일
뿐 확정/적용하지 않았다. 로컬 앱 설정에 기존 Android ID가 없고, 공개 Play 조회는
접근 제한 및 검색의 한계 때문에 전역 미사용을 증명하지 못한다. 사용자 Play Console,
기존 EAS Android 빌드/자격증명, Firebase 앱에서 실제 기존 ID를 확인한 뒤 승인해야 한다.

expo-constants는 설치/모듈 경로/SDK 범위가 정상이고 public config와 Android JS export에서
오류가 재현되지 않았다. 일반 Node의 require('expo-constants')는 React Native 네이티브
런타임 엔트리를 Node로 실행하며 expo-modules-core의 확장자 없는 내부 import에서
ERR_MODULE_NOT_FOUND를 재현했다. 이는 패키지 미설치 증거가 아니다.
이전 오류 원문이 없어 이전 현상과 동일한 원인인지 확정할 수 없다. app.config.ts에서는
expo-constants를 runtime import하지 않으며 이를 재발 방지 테스트로 고정했다.

Expo Doctor가 지적한 SDK 58 버전 불일치만 공식 expo install --fix --npm으로 정렬했다.
SDK 메이저 업그레이드나 npm audit 강제 수정은 하지 않았다. 네이티브 패키지 변경으로
다음 실제 기기 검증 시 새 Development Build가 필요하지만 빌드는 별도 승인 대기다.

최종 검증: Expo Doctor 20/20 PASS, 모바일 회귀 173개 PASS, TypeScript/lint PASS,
실제 public config의 owner/slug/projectId 일치 PASS. expo-constants는 58.0.15이며
SDK 권장 범위 내이므로 임의의 Node용 대체 구현이나 node_modules 수정은 하지 않았다.
최종 설치 트리 npm audit 보고는 13건(moderate 12/high 1)이며 별도 미해결로 남긴다.

## 2026-11-06 Android 식별자 최종 승인 반영

사용자가 `com.drmas.mobile`을 최종 승인했다. app.config.ts의 기본 Android package에
반영했다. 기존 package가 있으면 보존하며 충돌하는 환경 입력은 거부한다.
owner/slug/projectId와 notifications/dev-client 설정은 유지한다. 이전 절의
패키지명 미확정 상태는 이번 승인으로 해소됐다. EAS Build와 Firebase 설정은
여전히 별도 승인 전 실행하지 않는다.

## 2026-11-06 Firebase Android 파일 연결

사용자가 등록한 Firebase Android 앱의 google-services.json에서 com.drmas.mobile과
일치하는 Android 클라이언트 1개를 확인했다. JSON 원문/API 키는 출력하지 않았다.
app.config.ts는 ./google-services.json을 연결하고 기존 경로가 있으면 보존한다.
실제 파일은 /mobile/google-services.json Git 제외 규칙으로 로컬에만 보관한다.
이는 Firebase 클라이언트 설정이며 FCM v1 서버 자격증명 업로드 완료를 의미하지 않는다.
아직 EAS Build/자격증명 업로드/푸시 발송은 실행하지 않는다. Git 제외 파일을 미래 EAS
빌드에 제공하는 방법은 빌드 승인 시 별도로 준비한다(예: EAS 파일 환경변수).

## EAS File 환경변수 경로 연결 수정

사용자가 development 환경에 GOOGLE_SERVICES_JSON을 File 형식으로 등록했다.
app.config.ts는 GOOGLE_SERVICES_JSON의 경로를 우선 사용하고, 없으면 로컬
./google-services.json을 사용한다. File 변수는 빌더에 복원된 파일의 경로이며
JSON 원문을 환경변수 문자열로 넣는 방식이 아니다. eas.json development 프로필은
environment=development를 유지하고 env에 GOOGLE_SERVICES_JSON을 덮어쓰지 않는다.

로컬 파일은 Git에서 계속 제외한다. Firebase Admin SDK/서비스 계정 키의 일반적인
파일명과 mobile/private-credentials/도 제외했다. 임의 이름의 비공개 키는 저장소 밖에
보관한다. FCM 서버 서비스 계정 키를 google-services.json 대신 연결하면 안 된다.
Keystore는 재생성하지 않는다. 이 수정과 로컬 모의 검증은 실제 EAS 빌더에서 파일이
복원됐거나 APK가 성공했다는 증거가 아니며, 빌드는 별도 승인 단계다.

이번 수정 검증: EAS project 범위 development 메타데이터에서 변수 존재/File 유형 확인,
로컬 fallback 및 합성 File 경로의 실제 Expo public config 해석 PASS,
모바일 테스트 176개/Doctor 20개/TypeScript/lint/diff PASS. 원격 변수 값이나
파일 내용을 조회·출력하지 않았고 실제 EAS Build는 실행하지 않았다.

로컬 검증: 모바일 회귀 170개 PASS, TypeScript/lint PASS, 실제 Expo config 해석 PASS.
설치 과정 npm audit는 전체 의존성 트리에서 18건(low 1/moderate 14/high 3)을 보고했다.
기존 대비 증가 여부는 미확인이며 자동 audit fix/강제 업그레이드는 수행하지 않았다.
실제 APK 빌드, 휴대전화 네이티브 권한 조회, 토큰 발급/등록/수신은 미검증이다.
