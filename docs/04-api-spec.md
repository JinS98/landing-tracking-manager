# API 명세

12일차에 `GET /tracking-config?siteId=...`의 독립 HTTP 핸들러와 Firestore 게시본 리더를 구현했습니다. 서버에 마운트하거나 배포하는 진입점은 아직 없으며 관리자 데모는 서버 요청을 보내지 않습니다. 아래 관리자 계약은 기존 회사 관리자 인증 게이트웨이와 서버 검증기를 연결한 후 구현합니다. `functions/src/access.ts`에는 HTTP 라우트가 아닌 접근 검사 조합 함수만 있습니다.

## 운영자 인증·인가 계약

관리자 화면과 API는 회사 게이트웨이 뒤에 둡니다. 게이트는 직원 세션을 확인하고 클라이언트가 보낸 신원 헤더를 제거·덮어써야 하며, API 직접 접근 경로는 차단해야 합니다. 서버 `AccessVerifier`는 원시 헤더가 아니라 게이트가 보증한 연결 또는 서명된 assertion을 검증해 `subject`, `gateway`, `sessionId`, `expiresAtEpochMs`를 반환합니다. 검증 방식과 실제 게이트 설정은 아직 미정입니다. `GatewayRequest.transport`는 서버 연결에서 얻은 정보여야 하며 브라우저 입력에서 복사하면 안 됩니다.

각 요청은 메서드·자원 식별자 확인 후 게이트 검증 → 서버 기준 세션 만료 확인 → 쓰기 요청의 세션 결합 CSRF·Origin 검사 → 행동과 업체·사이트 범위 인가 순서로 처리합니다. 행동과 자원은 서버 라우팅 및 검증된 경로 변수에서 정하고 클라이언트가 보낸 action 값을 전달하지 않습니다. 모든 관리자 **읽기와 쓰기**에 신원·권한 검사를 적용합니다. 브라우저의 actorId/role과 요청 본문에 적힌 권한은 사용하지 않습니다. `AccessVerifier`, `CsrfVerifier`, `AdminAuthorizer` 중 하나라도 연결되지 않으면 접근 검사 함수가 503으로 거부하며 운영 라우트 자체도 배포하지 않습니다. 쿠키 기반 세션의 CSRF 설계는 [OWASP 가이드](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), 세션 만료는 [OWASP 세션 지침](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)을 기준으로 실제 게이트에 맞춰 구현해야 합니다.

## 관리자 읽기·쓰기 API: 사내 게이트 뒤

현재 아래 경로는 모두 **계획**이며 요청을 받는 서버가 없습니다. siteId와 companyId는 서버가 검증하고, `AdminAuthorizer`는 확인된 운영자와 행동·자원 범위를 함께 평가해야 합니다. 입력 스키마 검증, 감사 로그, 속도 제한도 HTTP 구현 전에 필요합니다.

| 메서드/경로 | 입력 | 처리 |
|---|---|---|
| GET /admin/companies | 없음 | 접근 게이트 및 업체 조회 권한 확인. 현재 데모 검색은 클라이언트에서 수행 |
| GET /admin/sites | companyId? | 접근 게이트 및 허용 사이트 범위 확인 |
| GET /admin/sites/{siteId}/draft | siteId | 사이트 조회 권한 확인 후 비공개 초안 반환 |
| POST /admin/sites | siteId, companyId, domain, environment | siteId 고유 확인, 멱등 등록, 기존 설정 보존 |
| PUT /admin/sites/{siteId}/draft | expectedVersion, common, conversions | 매체별 검증, 버전 충돌 검사 |
| POST /admin/sites/{siteId}/publish | expectedVersion | 원자적 릴리스 생성, 공개 JSON 배포 |
| POST /admin/sites/{siteId}/rollback | targetVersion | 이전 내용을 새 릴리스로 게시 |
| GET /admin/sites/{siteId}/history | cursor | 권한 확인 후 감사/릴리스 조회 |
| POST /admin/imports/preview | `.xlsx` 파일, 열 매핑 | 관리자 접근 검사 후 서버가 파일과 각 행을 재검증하고 등록·건너뜀·오류 미리보기 반환. 미구현 |
| POST /admin/imports | `.xlsx` 파일, 열 매핑, 미리보기 digest | 관리자 접근 검사 후 파일·매핑을 다시 검증, importJobs 멱등 선점과 행별 트랜잭션 처리. 미구현 |
| GET /admin/imports/{jobId} | 작업 ID | 관리자 접근 검사 후 상태·건수·행별 오류 조회. 미구현 |

## 배포 주체 등록 계약

5일차 CLI는 `POST /internal/sites/register`로 `siteId`, `companyId`, `domain`, `environment`를 전송하도록 구현했습니다. 기본 실행은 dry run이며, `--apply`는 HTTPS URL과 배포 파이프라인의 별도 Bearer 자격 증명이 있어야 요청합니다. 응답 계약은 신규 `201 {status:"created", ...입력}`, 동일 입력 재시도 `200 {status:"existing", ...입력}`, 입력 오류 400, 미인증 401, 범위 부족 403, 업체 없음 404, 다른 등록과의 충돌 409입니다. CLI는 5xx·네트워크 오류만 최대 한 번 재시도합니다. 실제 HTTP 경로는 아직 없습니다.

`functions/src/registerSite.ts`에는 `DeploymentVerifier` 계약과 Firestore 등록 트랜잭션이 있습니다. 검증기는 직원 쿠키가 아닌 CI/서비스 자격 증명의 서명·발급자·대상 서비스·만료·허용 범위 및 신뢰된 진입점을 확인해야 합니다. 현재는 이 검증기의 운영 구현이 없으며, 미설정 시 등록 진입 함수는 503으로 거부합니다. 자격 증명을 URL·로그·저장소에 넣지 않습니다. HTTP 핸들러와 게이트 연결 전에는 운영 쓰기 API를 배포하지 않습니다. `importJobs` 갱신과 배포 성공 이벤트 연결도 후속 작업입니다.

## 공개 SDK 설정 조회

`functions/src/publicConfig.ts`의 `createPublicConfigHandler(firestorePublicConfigStore(db))`는 관리자 쓰기 경로와 독립된 `GET /tracking-config?siteId=...`를 처리합니다. `HEAD`도 허용합니다. `trackingConfigs/{siteId}.publishedVersion` 포인터가 1 이상일 때만 `trackingReleases/{siteId}__v{version}`의 불변 `config`를 읽고, `projectPublishedConfig`로 공개 필드만 투영합니다. 초안, 업체 내부 정보, 운영자, 로그, 비밀키는 응답에 넣지 않습니다. `sites/{siteId}.domain`은 HTTPS Origin 일치 시 CORS 허용 여부를 정하는 데만 사용합니다. Origin이 달라도 서버 간 공개 조회는 가능하지만 브라우저 CORS 접근은 허용하지 않습니다.

응답 필드는 `schemaVersion`, `siteId`, `releaseVersion`, `publishedAt`, `common`, `conversions`뿐입니다. SHA-256 기반 강한 ETag를 제공하며 `If-None-Match`가 현재 본문과 같으면 `304`를 반환합니다. `Cache-Control: public, max-age=0, s-maxage=0, must-revalidate`로 브라우저·공유 캐시가 매번 재검증하도록 합니다. 게시 HTTP 경로 및 CDN purge가 구현되기 전까지 TTL은 0초입니다. 포인터가 바뀐 다음 원본 서버 요청은 새 ETag와 게시본을 반환하지만 운영 CDN 배포·purge는 아직 검증되지 않았습니다. 미게시·없는 사이트는 `404`, 잘못된 siteId는 `400`, 메서드 불일치는 `405`, 포인터와 릴리스 불일치 또는 저장소 오류는 `503`으로 응답하고 오류 응답은 `no-store`입니다. 공개 경로의 속도 제한·서버 실행 환경·TLS/CDN 연결은 배포 시 추가해야 합니다.

## 오류와 동시성

관리자 API는 미인증·만료 세션 401, CSRF·권한 부족 403, 입력·자원 누락 400, 메서드 불일치 405, 버전 충돌 409로 구분할 계획입니다. 게이트나 필수 검증기가 미설정이면 접근 검사 계약은 503을 반환하지만, 실제로는 해당 HTTP 라우트를 배포하지 않습니다. 서버 인프라 오류도 접근을 허용하지 않습니다. 게시 작업은 Firestore 트랜잭션과 CDN 결과를 추적할 수 있어야 하며, 배포 실패 시 이전 공개 버전을 유지해야 합니다. 브라우저 연결 인터페이스는 `apps/admin/src/lib/adminGateway.ts`에 선언돼 있고 실제 구현은 없습니다.
