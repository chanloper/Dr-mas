# pgvector 및 Dr.MAS 통합 설계 (미구현)

## 저장소 확장

현재 Repository는 read/transaction으로 상태 읽기와 변경을 격리합니다. LocalRepository 외에 데이터베이스 구현을 추가할 수 있지만, 전체 상태 스냅샷 인터페이스를 그대로 거대 DB에 매핑하면 효율이 낮습니다. 실제 pgvector 이전 시 문서 upsert/delete, 작업 claim/checkpoint, 임베딩 캐시 조회/저장, 후보 검색을 페이지 단위 메서드로 분리해야 합니다. 검색 모듈도 DB 후보 검색 어댑터로 교체합니다. 이 문서는 설계이며 동작하는 pgvector 어댑터를 제공하지 않습니다.

운영 테이블과 별도의 rag 전용 스키마/개발 DB에서 다음 엔터티를 설계하세요.

- documents: id PK, title, publisher, source_url UNIQUE, published_at, updated_at, collected_at, category, content_hash, version, rights JSONB.
- chunks: id PK, document_id FK ON DELETE CASCADE, version, text, offsets, content_hash. 문서 버전 전환 시 Chunk/벡터를 하나의 트랜잭션으로 전환합니다.
- embeddings: chunk_id FK, profile, embedding vector(768), UNIQUE(chunk_id, profile). 현재 문서/질문 태스크는 같은 검색 프로필을 공유합니다. 모델/차원 변경 시 새 프로필·새 인덱스로 구축하고 원자적으로 전환합니다.
- embedding_cache: content_hash + profile + document-task를 복합키로 저장합니다. 약관 철회/삭제 시 캐시 보관 정책을 적용합니다.
- jobs: document/version/profile, state, attempt, next_attempt_at, lease_expires_at, last_error_code. 원자적 작업 점유와 재시작을 구현합니다.
- usage_reservations: 프로젝트/기간별 호출·토큰 예산 예약과 실제 사용량 정산. 여러 인스턴스의 전역 rate limiter를 둡니다.

코사인 검색은 pgvector 연산/인덱스의 공식 버전 지원을 확인하고 HNSW 등을 평가합니다. 한국어 정확 문자열 검색은 pg_trgm/적합한 형태소 인덱스와 병행하고 상위 후보를 애플리케이션에서 결합합니다. 현재 점수는 키워드 0.55 + 양의 코사인 0.45이며 학습된 reranker가 아닙니다. 임계값과 가중치는 독립된 실제 평가 세트로 보정해야 합니다.

스키마/RLS/서비스 역할 권한은 개발 DB에서 별도 검토·테스트해야 합니다. 이 프로젝트에서 기존 DrMAS-Dev 테이블/RLS나 원격 SQL은 변경하지 않았습니다.

## 인증 서버 계약

현재 HTTP 서버는 없습니다. Node 인증 서버가 SDK와 저장소를 소유하도록 통합하세요. 앱에 GEMINI_API_KEY를 전달하면 안 됩니다.

제안 요청: POST /v1/health-information/query, Authorization: Bearer <Supabase access token>, JSON {question, mode: "search" | "quotes"}. 여기의 경로는 새로 만들 내부 서버 계약 제안이며 외부 공공 API 경로가 아닙니다.

서버는 토큰 검증 후 사용자/프로젝트별 제한, 본문 바이트 제한, 동시 요청, 승인된 공개 일반질문인지 검사를 수행합니다. 원본 환자 프로필·진료/복약 기록을 요청에 포함하지 않습니다. 현재 publicQuestion 불리언과 정규식만으로 개인정보 전송 방지가 완성되지 않습니다.

권장 응답:
- ok/local_evidence: 검색 hits와 documentId/chunkId/title/sourceUrl/updatedAt/text/score.
- grounded_quotes: 원문에서 검증된 claims와 출처. 자유로운 의료 답변이 아님을 UI에 표시합니다.
- insufficient_evidence: 자료 부족. 출처를 임의로 붙이지 않습니다.
- emergency/professional/privacy: 적절한 안내. 응급 분기는 검색/외부 호출 전에 실행합니다.
- unverified_response: 모델 응답 검증 실패. 생성 문구를 표시하지 않습니다.

원문 인용문은 항상 일반 텍스트로 렌더링하세요. HTML 실행, 도구 실행, 원문 내 명령 수행을 허용하지 마세요. 원문 URL/날짜/제목과 일반정보 안내를 함께 표시합니다. 프롬프트는 충돌 시 보류하도록 요구하지만 실제 충돌 탐지나 의미적 의학 정확성을 자동 검증하지 않습니다.

## 집 컴퓨터에서 통합하는 순서

1. 집 컴퓨터의 최신 Dr.MAS를 별도로 보존하고 이 독립 폴더를 복사하거나 새 독립 저장소로 옮깁니다. .env, data, .tools, node_modules는 공유 저장소에 올리지 않습니다. 공개자료도 재배포 권한을 별도 확인합니다.
2. Node 24 LTS 설치 후 npm ci, npm run check, npm test를 실행합니다. 공개자료는 적법하게 다시 등록하고 서버 전용 키를 설정합니다.
3. 별도 개발 서버에서 실제 임베딩/질문 호출을 소량 수행하여 모델 가용성·키·차원·과금·취소·근거 보류 동작을 확인합니다. 테스트 자료를 의료 근거로 승격하지 않습니다.
4. 독립적인 의료 검색 평가 질문과 전문가 검토로 근거 일치·안전성·오래된 자료/충돌·인젝션 방어를 검증합니다. 현재 테스트는 임상 검증을 대체하지 않습니다.
5. 위 인증 서버를 구현하고 Expo 앱은 그 서버만 호출합니다. 기존 인증/복약 기능과 DB는 이 모듈과 분리한 개발 환경에서 연결합니다.
6. 대규모 운영 이전에 pgvector/전역 제한/작업 큐를 구현합니다. Supabase Edge Functions를 선택하면 로컬 Node 파일 저장소를 그대로 사용할 수 없으므로 DB 어댑터와 런타임 호환성 검증을 먼저 완료합니다.
7. 별도 배포 검토와 사용자 승인을 거친 뒤 운영 통합합니다. 현재 작업에는 외부 배포가 포함되지 않습니다.
