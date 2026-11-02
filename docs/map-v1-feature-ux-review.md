# Dr.MAS MAP v1 기능·사용자 경험 점검

작성일: 2026-11-01 (Asia/Seoul) · 브랜치: DrMAS-Mobile

## 1. 결론과 범위

현재 앱은 공통 UI와 인증 서비스의 기반이 있으나, 사용자가 실제 서비스를
끝까지 완료하는 상태는 아니다. 기기 내 예시 복약 체크와 화면 이동은 구현돼
있고, Supabase Auth는 코드 연결 상태다. 실제 가입·로그인은 이메일 발송 제한으로
대기 중이라는 사용자 제공 상태를 기준으로 했다. 원격 SQL/RLS 실행은 미검증이다.
병원·약국 검색, 의료정보 RAG, OpenAI 상담은 현재 모바일에 구현되지 않았다.

이번 점검은 소스·설정·기존 테스트·공식 문서를 읽은 분석이다. Android 실제 화면,
TalkBack, 키보드, 대형 글꼴, 네트워크 장애, 브라우저, 실제 Auth/DB는 직접
실행 검증하지 않았다. 코드에서 확정되는 사실과 재현이 필요한 위험을 구분한다.
기능·UI·SQL·의존성은 변경하지 않으며 보고서만 작성한다. .env나 사용자 데이터는
읽지 않는다. 제품의 공식 MAP 정의나 출시 기준은 제공되지 않아 아래 목표는
현재 요청의 핵심 기능에 맞춘 **제안 범위**다. 이 명칭은 내부 문서에서만 사용한다.

## 2. 현재 구조와 준비도

- `src/app/_layout.tsx`는 Stack 설정, 실제 route 파일은 `index.tsx` 하나다.
  화면은 컨트롤러의 route/tab 상태로 조건부 렌더링한다.
- `features/app/useDrMASController.ts`가 인증·복약·메시지·SOS를 모두 관리한다.
  기능 간 수정 영향이 커질 구조이며 실제 라우팅·기능별 데이터 훅 분리가 필요하다.
- `components/ui.tsx`의 색상·패널·버튼·필드·타일이 일관된 시각적 기반을 제공한다.
  반면 접근성 속성·disabled/busy/error 상태를 공통 API로 충분히 표현하지 못한다.
- Supabase 기본 인증은 `services/auth.ts`, client는 `services/supabase.ts`,
  세션 저장은 `secureSessionStorage.ts`다. `auth.mariadb.ts`는 보존된 이전 경로이며
  기본 앱의 fallback이 아니다. mobile-api의 검증 결과를 Supabase 검증으로 대체할 수 없다.
- `services/medications.ts`에는 목록·기록 upsert·연결 RPC 호출이 있지만,
  현재 화면/컨트롤러에서 import하지 않는다. 함수 존재가 UI 연동 완료를 의미하지 않는다.
- PostgreSQL 실제 테이블명은 profiles/medications/medication_records/care_links다.
  의료정보 문서·벡터·AI 대화·기관 검색·SOS 전송용 스키마는 없다.

## 3. 기능별 실제 상태표

상태 구분: **기기 동작**=로컬 상태/저장 동작 구현, **코드 준비**=서비스 있으나 실환경
완료 미확인, **미연결**=화면/안내만 있거나 고정 값, **미검증**=실제 실행 증거 없음.

| 기능 | 현재 실제 동작 | 근거 파일 | 상태·미완료 |
| --- | --- | --- | --- |
| 역할 선택 | 환자/보호자 선택 후 로그인 화면으로 이동 | WelcomeScreen.tsx, controller.selectRole | 기기 동작. 선택은 권한 부여가 아님 |
| 회원가입 | 이름·이메일·비밀번호 검사 후 SDK signUp | AuthScreen.tsx, auth.register | 코드 준비. 이메일 발송 제한으로 실제 완료 대기 |
| 이메일 확인 | session 없으면 확인 안내 후 로그인 화면 유지 | controller.submitAuth | 안내 구현. 재발송·앱 내 callback·재설정 흐름 없음 |
| 로그인 | signInWithPassword → getUser → profiles 역할 확인 | auth.ts | 코드 준비. 실제 사용자 세션/프로필 검증 미완료 |
| 로그인 유지 | SDK 전체 세션을 SecureStore chunk로 저장·복원, AppState refresh | supabase.ts, secureSessionStorage.ts | 코드·대체 SDK 테스트 있음. 기기 종료/재시작 실검증 필요 |
| 로그아웃 | 화면 잠금·메모리 일부 초기화·SDK 현재 세션 폐기 요청 | controller.signOut, auth.clearToken | 코드 준비. 원격 실패는 표시. 발급 JWT의 즉시 무효화 보장 아님 |
| 환자 홈 | 복약 진행률·서비스 링크·SOS 진입 | PatientHome.tsx | 로컬 동작. 심박수 72/수면 7.5는 상수 예시 |
| 보호자 홈 | 연결 전 안내·빈 지표·이 기기 SOS 확인 | GuardianHome.tsx | 미연결. 실제 환자·복약·위치·웨어러블 조회 없음 |
| 보호자 승인 | 자가 가입 차단, 연결 SQL/RPC 서비스 준비 | auth.ts, medications.ts, SQL | 코드 준비/DB 미검증. 초대·승인·철회 UI 없음 |
| 복약 체크 | 예시 일정 3개 체크·진행률·날짜별 AsyncStorage | MedicationScreen.tsx, controller | 기기 동작. 실제 처방 등록/편집·계정별 동기화·이력 조회 없음 |
| 복약 클라우드 | 목록·upsert 함수만 준비 | medications.ts | 화면 미연결. 기존 숫자 일정 ID와 서버 UUID 매핑도 없음 |
| AI 상담 | 입력을 메모리에 추가하고 고정 안내 응답 추가 | AiScreen.tsx, controller.sendChat | OpenAI 호출·검색·추론 없음. 대화는 서버 저장하지 않음 |
| 의료정보 RAG | 전용 화면/서비스/문서 수집/검색 스키마 없음 | mobile/src 전체, SQL | 미구현 |
| 병원·약국 검색 | 서비스 카드·준비 안내창 | ServicesScreen.tsx | 미연결. 위치 권한·검색·목록·지도·기관 API 없음 |
| 처방전 분석 | 서비스 이동·안내창 | PatientHome, MedicationScreen, ServicesScreen | 카메라/OCR/약품 확인·스케줄 등록 없음 |
| 건강 데이터 | 연동 전 문구와 상수/빈 값 | 환자·보호자 홈 | Health Connect 등 실제 연결 없음 |
| SOS | 초 단위 카운트다운·취소·메모리 알림 상태·확인 | app/index.tsx, controller, GuardianHome | 기기 상태만. push/SMS/전화/119/다른 기기 전달·영속 저장 없음 |
| 설정 | 계정 역할·이메일 표시, 10/20/30초 선택, 로그아웃 | SettingsScreen.tsx | 기기 동작. 지연값은 메모리이며 앱 재시작 시 기본값 |
| 웹 | web 스크립트·React Native Web·server output 설정 | package.json, app.json | 빌드·브라우저 미검증. 현재 SecureStore 의존으로 로그인 유지 차단 |

## 4. 미연결 버튼과 사용자 흐름

| 위치·버튼 | 실제 onPress 결과 | 사용자 관점 문제 |
| --- | --- | --- |
| 환자 홈: 처방전 분석·병원 찾기 | services 탭 이동 | 분석/검색이 시작되지 않음 |
| 환자 홈: AI 건강 상담 | AI 탭 이동 | 도착 후 고정 응답만 제공 |
| 환자 홈: 복약 관리/상세 | medication 탭 이동 | 정상 이동하지만 예시 로컬 일정만 있음 |
| 복약: 처방전 기능 보기 | services 탭 이동 | 처방전 기능 자체로 진입하지 않음 |
| 서비스: 처방전·병원/약국·건강 데이터·보호자 연결 | 모두 Alert 안내 | 버튼은 반응하지만 실제 작업이 시작되지 않음 |
| 보호자: 가족 연결 기능 준비 중 | Alert 안내 | 연결 신청·수락·철회할 수 없음 |
| AI: 전송 | 로컬 질문+고정 답변 추가 | 실제 AI 상담 요청이 아님 |
| 환자/보호자 SOS | 같은 기기의 메모리 타이머·상태 | 상대 기기에 전송되지 않음 |

이 버튼들을 이벤트가 없는 고장 난 버튼으로 분류하지는 않는다. 그러나 실제
업무 목적을 완료하지 못하므로 기능 완료로 집계하면 안 된다. 준비 상태를
버튼 자체에서 일관되게 알리고, 실제 연결 후에는 해당 작업 화면으로 직접
진입시키는 방식을 제안한다. 이번 작업에서는 문구나 버튼을 바꾸지 않았다.

사용자 여정의 현재 장애물:

1. 첫 진입 → 역할 선택 → 가입: 실제 이메일 발송 제한에서 중단될 수 있다.
2. Auth만 통과해도 프로필 스키마/행이 없으면 홈에 들어갈 수 없다. 정상적인
   권한 방어지만 사용자가 반복 가입으로 해결할 수 없는 오류다.
3. 보호자로 시작할 수 있지만 가입에는 별도 승인이 필요하다. 이 조건을
   가입 전에 설명하고 기존 승인 계정 로그인과 승인 신청을 분리할 필요가 있다.
4. 홈 이후 핵심 서비스는 안내창에 도달하는 경우가 많다. 로그인 성공만으로
   검색/상담/가족 돌봄 기능이 사용 가능해지는 상태는 아니다.

## 5. 우선 해결할 코드·데이터 문제

아래는 분석 결과이며 앱을 수정하거나 실제 개인 기록으로 재현하지 않았다.

| ID | 우선순위 | 발견 사항·근거 | 제안 |
| --- | --- | --- | --- |
| DATA-01 | P0, 실제 복약 전 | storageKey가 날짜만 사용하고 user.id가 없음 | 사용자별 namespace와 소유권 분리. 기존 예시 데이터 자동 귀속 금지 |
| DATA-02 | P0, 실제 복약 전 | 로드 실패에도 seedMeds와 medsReady=true를 설정해 저장 effect가 빈 체크를 다시 쓸 수 있음 | 읽기 성공·수정 여부·저장 가능 상태 분리. 실패 시 기존 데이터 보존, 장애 주입 재현 |
| DATA-03 | P1 | 날짜 전환 render에서 이전 medsReady/meds와 새 날짜 key가 함께 저장될 가능성 | 날짜별 원자적 상태/요청 식별자, 쓰기 직렬화·가짜 시계 테스트 |
| DATA-04 | P1 | 자정 통과를 AppState 복귀나 첫 체크에서만 감지하며 날짜가 바뀐 첫 체크는 return | 전경 자정 갱신과 입력 재시도 안내, 시간대 변경 검사 |
| AUTH-01 | P0 | SDK SIGNED_OUT 콜백은 user/route/password만 초기화; 수동 signOut과 달리 메시지/SOS 등 초기화가 없음 | 인증 경계 공통 정리 함수와 계정별 캐시. 계정 A→B 시 이전 입력 노출 방지 |
| AUTH-02 | P0 | 실제 Auth/프로필/RLS 미완료 | 이메일 설정 해결, 개발 DB 실행, 실제 사용자 JWT 접근 행렬 검증 |
| ROLE-01 | P1 | 두 역할이 home 외에는 동일 탭·로컬 복약 편집 UI를 공유 | 보호자 조회 전용 경로와 환자 선택. 서버 RLS는 UI 숨김과 별개로 유지 |
| DATA-05 | P1 | patient 홈에는 medsReady/medsError 표시가 없고 로딩 중 체크는 조용히 무시 | 공통 로딩/오류/재시도·disabled 의미 적용 |
| SOS-01 | P0, 실전송 주장 전 | 메모리 타이머만 있으며 앱 종료 시 상태 소실, 백그라운드 지연 가능 | 전송 범위를 확정하기 전 실제 긴급 연락 기능으로 취급하지 않음 |
| NAV-01 | P1 | route/tab이 React state이고 route 파일은 index 하나, BackHandler 없음 | 실제 Router 경로·뒤로가기·직접 링크·복원 규칙 설계 |
| ARCH-01 | P1 | 한 컨트롤러가 모든 기능 상태를 보유 | 인증/복약/상담/SOS 훅과 서비스 분리, 세션 변경 시 수명주기 명시 |
| DATA-06 | P1 | 복약 달성률이 meds.length로 직접 나눔; 현재 seed 3개에서는 정상이나 서버 빈 목록은 NaN% 가능 | 실제 목록 연결 전 빈 상태·0분모 처리 |

DATA-02/03은 effect 순서상 위험을 발견한 것으로, 현재 테스트가 해당 장애·
경쟁 조건을 검증했다는 의미는 아니다. 메모리/장애 대체 저장소로 추가 재현 후
수정해야 한다. AsyncStorage 데이터를 이번 점검에서 지우거나 업로드하지 않았다.

보호자 계정의 역할 승인은 개별 환자의 정보 공유 승인과 다른 절차다. 둘 다
클라이언트 선택으로 대체하면 안 된다. 현재 서버 역할 확인·자가 보호자 가입 차단은
좋은 경계지만 역할 승인 운영 절차와 환자 동의 UI가 아직 필요하다.
Supabase 로그아웃은 refresh session 폐기를 다루며 이미 발급된 access JWT가
즉시 무효화되는 것으로 가정하지 않는다.
[Supabase signOut](https://supabase.com/docs/reference/javascript/auth-signout)

## 6. 디자인·오류 처리·접근성

좋은 기반:

- 공통 색상·카드·타일·버튼으로 일관된 구조가 있으며 환자 파랑/보호자 초록을 구분한다.
- 하단 탭에 선택 상태, 복약 체크박스에 checked 상태, 역할 버튼에 명시적 label이 있다.
- Auth 입력 오류와 서버 오류, 미연결 서비스와 예시 건강지표를 숨기지 않는다.
- SOS 취소와 로그아웃의 명확한 동작이 있고 계정 역할은 서버에서 읽는다.

개선이 필요한 부분:

| 항목 | 소스에서 확인한 사항 | 우선순위·검증 |
| --- | --- | --- |
| 대비 | 흰 배경의 subtle 글자 2.56:1, 초록 사용자 말풍선의 흰 글자 3.76:1 | P1. 작은 본문 대비 개선. 실제 화면·다른 상태도 검사 |
| 작은 글자 | 탭 10, 칩 11, 캡션 12 크기 | P1. 큰 글꼴·320dp·한국어 줄바꿈 점검 |
| 입력 라벨 | Field의 Text 라벨이 TextInput과 명시적으로 연결되지 않음 | P1. accessibilityLabel/labelledBy와 오류 연결, TalkBack 검사 |
| 버튼 의미 | QuickTile·서비스 카드·비밀번호 토글·지연 칩의 역할/선택/상태 정의가 불완전 | P1. 공통 컴포넌트에서 표준화 |
| 터치 영역 | Action minHeight 44는 있으나 비밀번호 토글 등에는 일관된 padding/hitSlop이 없음 | P1. 실제 측정 후 확대 |
| SOS overlay | Modal이 아닌 View이며 모달 포커스·배경 접근 차단·Android 뒤로가기 처리 없음 | P1. TalkBack 포커스와 취소 경로 검사 |
| 로딩 | authLoading이면 전체 인증 화면을 spinner로 교체; 가입/복원 구분 문구 없음 | P1. 작업별 상태·진행 안내, 포커스 복원 |
| 확인 안내 | 이메일 확인 대기 문구도 authError로 표시해 빨강 alert가 됨 | P1. 성공/대기/오류 의미 구분 |
| 비밀번호 UX | 오류 후 비밀번호를 모두 지움, 재설정/메일 재발송/자동완성 힌트 없음 | P1. 입력 보존/보안 기준과 재시도 흐름 정리 |
| 화면 전환 | 탭 전환 시 ScrollView key 변경으로 스크롤 리셋; 포커스/위치 복원 없음 | P1. 화면별 보존·접근성 안내 |
| 채팅 | 키보드 회피·최근 메시지 자동 스크롤·전송중/중단/실패·긴 대화 가상화 없음 | AI 연결 단계에서 필수 |
| 반응형 | 48% 타일·행 레이아웃, 최대 콘텐츠 폭/데스크톱 배치 없음 | 웹 전환 전 필수 |

대비값은 코드의 색상으로 계산했다. muted 본문/흰 배경은 약 4.76:1이지만
모든 텍스트가 통과한다는 뜻은 아니다. 선택되지 않은 탭도 클릭 가능한 기능이므로
비활성 예외로 단정하지 않는다. WCAG는 일반 텍스트 4.5:1, 큰 텍스트 3:1을
기준으로 설명한다. 이것은 접근성 전체 준수 판정이 아니다.
[W3C 대비 기준](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

원격 조회는 데이터가 없어도 실패 화면과 빈 상태를 구분해야 한다. 승인된 가족이
없는 상태, 권한 거부, 네트워크 오류, 서비스 준비 중은 서로 다른 사용자 상태다.
현재 일부 화면의 상태는 단순 문구/상수여서 실서비스 연결 시 다시 설계해야 한다.

## 7. 핵심 기능의 기술 준비도와 제안 구조

### 병원·약국 검색 — 준비도 낮음

현재는 전용 서비스·위치 권한·결과 목록이 없다. expo-location도 설치돼 있지 않다.
서버에서 기관 검색 제공자 호출을 감싸고 앱에는 정규화된 결과를 돌려주는 구조를
제안한다. 기존 mas_project의 다른 기능이 모바일에 자동 연결된 것으로 취급하지 않는다.

최소 흐름은 현재 위치 허용/수동 지역 입력 → 병원·약국 선택 → 거리/이름 목록 →
상세 주소·전화·외부 지도 진입이다. 위치 거부·오차·검색 결과 없음·timeout·쿼터를
처리하고 좌표·주소를 기본 로그에 남기지 않는다. 운영시간 정보가 없으면
영업 중이라고 추정하지 않는다. 진료과·야간 운영은 제공 데이터의 범위를 먼저 확인한다.

Kakao Local은 키워드/카테고리 검색과 병원 HP8·약국 PM9 분류를 제공한다.
이는 후보 제공자이지 계약 완료를 뜻하지 않는다. 사용 조건·최신성·쿼터를
검토하고 x/y 좌표 방향과 페이지 처리를 검증한다. 초기에는 목록+외부 지도 방식으로
시작하면 내장 지도 SDK 도입 범위를 줄일 수 있다.
[Kakao Local](https://developers.kakao.com/docs/ko/local/dev-guide),
[Expo SDK 58 Location](https://docs.expo.dev/versions/v58.0.0/sdk/location/)

### 의료정보 RAG — 준비도 낮음

문서 수집·벡터·검색 RPC·인용 UI·평가 데이터가 없다. 검색 기능과 답변 생성을
분리해 우선 검색 결과를 출처·개정일과 함께 검증하는 단계를 제안한다.

필요한 구성은 승인된 자료와 사용 권한, 문서/버전/해시/출처 메타데이터,
정제·chunking·embedding 파이프라인, 인덱스, 검색/재정렬, 결과 인용 및 삭제·갱신이다.
문서에 포함된 지시문은 시스템 명령으로 실행하지 않는다. 사용자별 자료가 생기면
검색 단계에서 RLS/ACL을 적용하고 결과를 모델에 보내기 전에 권한을 확인한다.
임베딩·검색 내용에도 민감정보 정책을 적용한다.

Supabase 중심 구조를 유지한다면 pgvector와 권한 있는 검색 RPC를 먼저 검토할 수 있다.
OpenAI Responses API의 file_search는 호스팅 검색 대안이지만, 별도의 저장소·
권한 경계·보관 정책이 필요하며 Supabase RLS가 자동으로 적용되는 것은 아니다.
두 방식을 동시에 구현하기보다 자료·권한·운영 비용을 기준으로 하나를 먼저 선택한다.
[Supabase RAG 권한](https://supabase.com/docs/guides/ai/rag-with-permissions),
[OpenAI 공식 File search 문서](https://developers.openai.com/api/docs/guides/tools-file-search)

### OpenAI AI 상담 — 준비도 낮음

현재 sendChat은 네트워크 호출 없이 고정 응답을 추가한다. 서버의 인증된 상담
엔드포인트, OpenAI 호출, 안전한 모델 출력 처리, 스트리밍/취소/재시도와 평가가 필요하다.
모델/가격/지연 목표는 아직 정하지 않았으며 임의의 최신 모델을 확정하지 않는다.

제안 경로는 앱 → JWT 검증 서버 → 권한 제한 검색 → Responses API →
검증된 답변/출처/안전 안내다. 서버 위치는 Supabase Edge Functions 또는 별도
API 중 운영 조건에 맞춰 확정한다. OpenAI 키를 EXPO_PUBLIC 환경변수나
manifest에 넣지 않는다. 서버에만 비밀 키를 두는 원칙은 OpenAI 공식 문서와 같다.
[OpenAI API 인증](https://developers.openai.com/api/reference/overview)

출처 없는 단정·검색 결과 없음·오래된 자료·약물 질문·위기 표현·서비스 장애를
포함한 평가셋을 준비한다. 응급성 안내는 모델 응답 완료만 기다리게 하지 않고,
자동 진단·처방이나 실제 구조 요청으로 오인되지 않도록 제품 범위를 정의한다.
건강 대화의 전송 동의·보관 기간·계정별 삭제·로그 마스킹도 서버 계약에 포함한다.

## 8. 웹·Vercel 사전 평가 (빌드·배포 미실행)

| 쟁점 | 현재 상태 | 필요한 결정/작업 |
| --- | --- | --- |
| 웹 인증 저장 | SecureStore 전용이며 미지원 시 오류 | native/web 어댑터 분리. 브라우저 저장소와 XSS 방어 또는 서버 cookie 세션의 책임 결정 |
| SSR | web.output=server | client/server 산출물과 호환 어댑터 설계. 단순 dist 정적 업로드로 해결한다고 가정 금지 |
| 서버 세션 | client는 모듈 단일 인스턴스 | 향후 SSR에서 사용자 세션을 전역 client로 공유하지 않도록 요청별 경계 설계 |
| 경로 | URL은 사실상 index 한 개 | 새로고침·브라우저 뒤로가기·북마크·Auth callback route 설계 |
| native API | AppState·SecureStore 중심 | window/document 없는 서버 환경과 플랫폼별 라이프사이클 검사 |
| 폼/Alert | 웹 키보드 제출·포커스·Alert 동작 미검증 | 폼 제출·에러 안내·키보드 탐색·접근 가능한 dialog 검증 |
| 위치 | 아직 구현 없음 | HTTPS/브라우저 권한 거부·수동 검색 경로 설계 |
| 비밀·환경 | 공개 값은 build/manifest에 포함 | Vercel 프로젝트 루트 mobile, 환경별 URL/공개 키 분리, 서버 키는 서버 전용 |
| 호출 | 미래 검색/AI 서버 없음 | CORS·쿠키·JWT·timeout·스트리밍·함수 실행 제한·비용 관리 |
| CI/배포 | Vercel 설정·브라우저 빌드 증거 없음 | 로컬 export/serve 검증 → 격리 preview → 승인 후 production 순서 |

현재 앱의 인증은 useEffect에서 시작하므로 SSR 사용자 세션 공유가 현재 발생한다고
확정하지 않는다. 서버 기능을 추가할 때의 위험이다. 또한 dev 웹 화면이 열리는 것과
production export·인증·라우팅이 되는 것은 별개의 검사다.

Expo는 정적 배포와 server output의 배포 방법을 구분하며 server rendering용
Vercel 어댑터도 문서화한다. 따라서 Vercel이 불가능하다고 판단하지 않지만,
현재 설정을 그대로 배포해 작동한다고도 판단하지 않는다. root/출력/어댑터는
실제 SDK 58 산출물과 사용 기능에 맞춰 검증해야 한다.
[Expo 웹 배포](https://docs.expo.dev/guides/publishing-websites/),
[Expo 서버 렌더링](https://docs.expo.dev/router/web/server-rendering/)

## 9. 우선순위와 단계별 실행 계획

P0는 실제 사용자/건강 데이터 사용 전 차단 요인, P1은 핵심 여정 완성,
P2는 범위 확대·운영 개선이다. 달력 일정과 인력은 미정이므로 완료 조건 중심으로 제안한다.

| 단계 | 우선순위 | 작업 | 선행 조건 | 완료 기준 |
| --- | --- | --- | --- | --- |
| S0 범위·데이터 경계 | P0 | 실제 SOS 포함 여부, 동의 범위, 계정별 로컬/클라우드 소유권, 보존·삭제 결정 | 제품 결정 | 기능별 완료 기준과 데이터 흐름 합의, 새 기록 자동 이전 없음 |
| S1 인증·DB | P0 | SMTP/메일 확인, 기존 Auth 프로필 보정 계획, 로컬 PostgreSQL 테스트, 승인된 개발 DB RLS | S0 | 실제 가입·로그인·복원·로그아웃, 환자 A/B·guardian·anon 행렬 통과 |
| S2 복약·가족 연결 | P0→P1 | 로컬 오류/경쟁 보존, UUID 일정 CRUD·기록 이력·동기화, 초대/승인/철회·조회 전용 보호자 UI | S1 | A→B 전환 때 기록 분리, 오프라인/자정/실패 보존, 철회 후 새 읽기 차단 |
| S3 기관 검색 | P1 | 위치/수동 지역·카테고리·목록·상세·외부 지도·서버 프록시 | S1, 제공자 확정 | 허용/거부/빈 결과/장애에서 사용자가 다음 행동 가능 |
| S4 의료정보 검색 | P1 | 승인 문서 ingest·버전·검색/ACL·인용·평가 | S1, 자료·권한 확정 | 고정 평가셋에서 검색 적합성·출처·누출 차단을 사전 정한 기준으로 통과 |
| S5 상담 | P1 | 인증 서버의 OpenAI Responses 연동, 검색 근거·스트리밍·취소·실패·안전 평가 | S4, 서버 비밀 관리 | 고정 답변 제거, 출처 기반 답변·미답변 정책·비용 제한·사용자별 접근 확인 |
| S6 품질·웹 준비 | P1→P2 | 뒤로가기/경로·TalkBack·대비·큰 글꼴·웹 저장/SSR·브라우저 빌드 | 각 기능 안정화 | Android 필수 흐름과 웹 build/serve 테스트 통과. 배포는 별도 승인 |
| S7 범위 확대 | P2 | OCR·웨어러블·실제 SOS 전달·고급 예약/알림 | 별도 제품/데이터 계약 | 각 플랫폼 권한·전달/취소/중복/장애·실제 수신을 별도 실증 |

기관 검색과 검색 문서 준비는 인증 안정화와 일부 병렬로 진행할 수 있으나,
권한 검증이나 데이터를 보호하는 작업을 뒤로 미루고 실제 사용자 데이터를 넣지는 않는다.
접근성·오류 처리는 S6 마지막에만 하는 작업이 아니라 각 단계의 완료 조건으로 검사한다.

제안하는 v1 종료 기준:

- 실제 인증과 프로필/RLS 검증이 끝나고 계정 간 정보가 섞이지 않는다.
- 환자는 본인 복약을 관리하고, 승인된 보호자는 허용된 정보만 읽는다.
- 병원·약국 검색과 출처가 있는 의료정보 검색·AI 상담의 핵심 여정이 실제로 완료된다.
- 미연결 기능을 동작하는 서비스로 표시하지 않고 SOS의 실제 범위를 일관되게 설명한다.
- 필수 흐름의 로딩·빈 상태·실패·재시도·뒤로가기·접근성 검사 결과가 있다.
- 원격 데이터/배포 변경은 검증 증거와 별도 승인 뒤에만 진행한다.

## 10. 다음 검증 목록과 이번 작업 기록

실기기: Android Expo Go/개발 빌드에서 320dp·대형 글꼴·TalkBack·키보드,
앱 종료/재실행·세션 만료·계정 전환·자정·비행기 모드·저장 실패를 검사한다.
SOS는 전경/배경/앱 종료/취소를 구분하고 전달되지 않은 상태를 성공으로 표시하지 않는다.
웹은 별도 저장소 어댑터 후 빌드/serve와 새로고침·직접 경로·로그아웃·CORS를 검사한다.
현재는 실제 UI 렌더링이나 원격 인증 성공·RLS 통과를 주장하지 않는다.

기존 테스트 실행 결과는 소스/대체 SDK/컨트롤러 하네스 수준으로만 해석한다.
프로세스 내부 MariaDB 회귀 테스트, Supabase SDK 대체 테스트, 정적 RLS 검사가
실제 의료정보 검색이나 원격 권한 검사를 대체하지 않는다.

이번에는 보고서만 생성하며 앱 코드·설정·데이터·UI·SQL은 수정하지 않는다.
개인정보·키·비밀번호를 출력하지 않고, 원격 DB SQL·Cloudtype 변경·배포·
Git commit/push도 수행하지 않는다. OpenAI 연동 검토에는 OpenAI Docs 스킬과
실제 공식 문서를 사용했으며 API 호출·키 조회·문서 업로드는 하지 않았다.

### 이번 실행 결과

| 실행 위치 | 명령 | 결과·한계 |
| --- | --- | --- |
| mobile | `npx.cmd --no-install tsc --noEmit` | 통과, TypeScript 오류 없음 |
| mobile | `EXPO_NO_DOTENV=1` 설정 후 `npm.cmd run lint` | 통과, 오류/경고 출력 없음. PowerShell에서는 `$env:EXPO_NO_DOTENV = '1'` 사용 |
| mobile | `node --test scripts/test-auth.cjs scripts/test-auth-integration.cjs scripts/test-supabase.cjs` | 36/36 통과. 대체 SDK·메모리 저장소·프로세스 내부 하네스이며 실제 HTTP/DB 아님 |
| 프로젝트 루트 | `node --test supabase/tests/static-review.test.cjs` | 9/9 통과. SQL 문자열/구조 검사이며 PostgreSQL 실행 아님 |

처음 npx/npm 호출은 PowerShell의 ps1 실행 정책에 차단됐다. 정책은 바꾸지 않고
Windows의 .cmd 진입점으로 재실행해 통과했다. 패키지 설치·서버 실행·웹 export는
하지 않았다. SQL runtime 검증 파일은 준비돼 있지만 이번에도 실행하지 않았다.
따라서 이 결과에 실제 RLS·Auth·Android UI 검증 완료를 포함하지 않는다.

이번 생성 파일은 이 보고서 하나다. 기존 작업 트리에 다른 수정 사항이 있으며
그 항목들을 이번 작업의 변경으로 집계하지 않는다.

### 근거 소스와 이어서 읽을 문서

- [화면 진입·탭·SOS overlay](../mobile/src/app/index.tsx)
- [컨트롤러·저장·인증 경계](../mobile/src/features/app/useDrMASController.ts)
- [공통 UI·색상·접근성 속성](../mobile/src/components/ui.tsx)
- [Auth 서비스](../mobile/src/services/auth.ts), [Supabase client](../mobile/src/services/supabase.ts),
  [세션 저장](../mobile/src/services/secureSessionStorage.ts)
- [미연결 복약·연결 서비스](../mobile/src/services/medications.ts)
- [환자](../mobile/src/screens/PatientHome.tsx), [보호자](../mobile/src/screens/GuardianHome.tsx),
  [복약](../mobile/src/screens/MedicationScreen.tsx), [인증](../mobile/src/screens/AuthScreen.tsx),
  [AI](../mobile/src/screens/AiScreen.tsx), [서비스](../mobile/src/screens/ServicesScreen.tsx),
  [설정](../mobile/src/screens/SettingsScreen.tsx)
- [Supabase 전환](supabase-transition.md), [RLS 검토·미검증 범위](supabase-rls-review.md),
  [로컬 RLS 테스트 절차](../supabase/tests/README.md),
  [기존 계정·데이터 이전 계획](supabase-account-migration-plan.md)
