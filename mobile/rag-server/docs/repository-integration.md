# 저장소 추가 범위와 집 컴퓨터 통합

이 서버는 DrMAS-Mobile 기준 feature/medical-rag 브랜치의 mobile/rag-server/에만 추가합니다. 기존 앱 코드와 설정을 수정하거나 DrMAS-Mobile에 병합하지 않습니다. 아직 GitHub에 없는 집 컴퓨터의 최신 모바일 소스를 대체하지 않습니다.

포함하지 않은 항목: .env/키/토큰, 문서 저장소, 실제 임베딩 및 캐시, 실행 로그/보고서, portable Node, node_modules. examples/와 test/의 내용은 직접 작성한 합성 자료입니다. 키를 읽는 코드와 키가 없는 환경변수 예제는 포함합니다.

집 PC에서는 최신 모바일 코드를 먼저 안전하게 보존/커밋/푸시한 후 feature/medical-rag의 mobile/rag-server 경로만 검토해 통합하세요. 전체 브랜치 merge로 오래된 모바일 파일을 가져오지 마세요. 새 작업 브랜치에서 필요할 경우 `git restore --source=origin/feature/medical-rag -- mobile/rag-server`처럼 경로만 가져오고 diff가 그 경로뿐인지 확인한 뒤 테스트·커밋합니다. 대상 경로에 기존 작업이 있으면 먼저 보존하고 덮어쓰지 마세요.

현재 mobile/tsconfig.json은 **/*.ts를 포함하므로 서버 TypeScript도 상위 모바일 타입 검사 범위에 들어갈 수 있습니다. 이번 작업은 모바일 설정 변경이 금지되어 있으므로 그 설정을 수정하지 않습니다. 최신 앱과 실제로 연결할 때 앱 검사에서 rag-server를 제외하거나 서버를 별도 workspace로 분리하는 변경을 따로 검토하세요. 이 폴더의 단독 검사 통과가 모바일 앱 전체 검사 통과를 의미하지 않습니다.

Node 24 LTS 설치 후 서버 폴더에서 npm ci, npm run lint, npm run check, npm test를 실행하세요. 운영 연결/외부 API 호출/배포는 이 브랜치 푸시와 별도입니다.
