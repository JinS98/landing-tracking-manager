## functions

관리자 쓰기 API와 공개 SDK 설정 조회 API를 분리해 구현할 서버 영역입니다. access.ts에는 게이트 검증과 관리자 인가 인터페이스만 있고 실행 가능한 API는 없습니다. 사내 접근 게이트·운영자 검증·Firestore Rules가 마련되기 전에는 관리자 쓰기 경로를 배포하지 않습니다. docs/01-architecture.md, docs/04-api-spec.md, docs/05-security.md 참조.

3일차 데이터 계약은 docs/02-database.md에 있습니다. 향후 서버는 `sites/{siteId}`의 멱등 생성, `trackingConfigs/{siteId}`의 초안 버전 검사, `trackingReleases/{siteId}__v{version}`의 추가 전용 게시, `auditLogs` 기록을 트랜잭션으로 처리해야 합니다. `firestore.indexes.json`은 업체별 사이트·사이트별 릴리스·감사 이력 조회용 계획입니다. 이 트랜잭션과 Firestore 연결 코드는 아직 없습니다. 현재 `firestore.rules`는 모든 브라우저 접근을 거부하며, 서버 SDK 접근은 Rules가 아닌 IAM과 `access.ts` 계약의 실제 구현으로 보호해야 합니다.
