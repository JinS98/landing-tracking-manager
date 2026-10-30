## functions

관리자 쓰기 API와 공개 SDK 설정 조회 API를 분리해 구현할 서버 영역입니다. access.ts에는 게이트 검증·인가 인터페이스와 접근 검사 조합 함수가 있고 실행 가능한 HTTP API는 없습니다. 사내 접근 게이트·운영자 검증·Firestore Rules가 마련되기 전에는 관리자 쓰기 경로를 배포하지 않습니다. docs/01-architecture.md, docs/04-api-spec.md, docs/05-security.md 참조.

3일차 데이터 계약은 docs/02-database.md에 있습니다. 서버는 `sites/{siteId}`의 멱등 생성, `trackingConfigs/{siteId}`의 초안 버전 검사, `trackingReleases/{siteId}__v{version}`의 추가 전용 게시, `auditLogs` 기록을 트랜잭션으로 처리하도록 설계했습니다. `firestore.indexes.json`은 업체별 사이트·사이트별 릴리스·감사 이력 조회용 계획입니다. 현재 `firestore.rules`는 모든 브라우저 접근을 거부하며, 서버 SDK 접근은 Rules가 아닌 IAM과 `access.ts` 계약의 실제 구현으로 보호해야 합니다.

4일차에는 `access.ts`에 `requireAdminAccess`와 `CsrfVerifier` 계약을 추가했습니다. 요청별 검증기 → 서버 기준 세션 만료 확인 → 쓰기의 CSRF 검사 → 행동·자원 범위 인가 순서로 실행하며, 의존성이 빠지면 503으로 거부합니다. 현재 제공되는 것은 조합 함수와 모의 구현 테스트뿐입니다. 실제 회사 게이트웨이 검증기, CSRF 토큰 검증기, 권한 정책, HTTP 핸들러는 없습니다. 브라우저가 보낸 신원 헤더만으로 `Operator`를 만들면 안 됩니다.

5일차에는 `registerSite.ts`에 Firestore Admin SDK 트랜잭션을 구현했습니다. 업체 존재 확인 후 `sites/{siteId}`와 빈 `trackingConfigs/{siteId}` 및 등록 감사 로그를 원자적으로 생성합니다. 같은 입력의 재요청은 기존 초안을 건드리지 않고 `existing`을 반환하며 업체·도메인·환경 충돌은 409로 거부합니다. `registerSiteFromDeployment`는 별도 `DeploymentVerifier`가 없으면 거부하지만 실제 자격 증명 검증기는 아직 없습니다. HTTP 핸들러와 운영 Firebase 연결은 추가하지 않았습니다. 로컬 에뮬레이터는 `npm run test:registration`으로 검증합니다.
