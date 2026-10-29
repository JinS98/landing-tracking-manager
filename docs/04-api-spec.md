# API 명세

현재 네트워크 API는 구현되지 않았습니다. 관리자 데모는 서버 요청을 보내지 않습니다. 아래 계약은 사내 접근 게이트와 Firestore Rules를 갖춘 후 구현합니다.

## 관리자 쓰기 API: 사내 게이트 뒤

모든 요청은 게이트가 검증한 운영자 컨텍스트를 서버가 다시 확인합니다. 브라우저가 보낸 actorId/role은 신뢰하지 않습니다. CSRF 방어, siteId 범위 검증, 입력 스키마 검증, 감사 로그와 속도 제한이 필요합니다.

| 메서드/경로 | 입력 | 처리 |
|---|---|---|
| POST /admin/sites | siteId, companyId, domain, environment | siteId 고유 확인, 멱등 등록, 기존 설정 보존 |
| PUT /admin/sites/{siteId}/draft | expectedVersion, common, conversions | 매체별 검증, 버전 충돌 검사 |
| POST /admin/sites/{siteId}/publish | expectedVersion | 원자적 릴리스 생성, 공개 JSON 배포 |
| POST /admin/sites/{siteId}/rollback | targetVersion | 이전 내용을 새 릴리스로 게시 |
| GET /admin/sites/{siteId}/history | cursor | 권한 확인 후 감사/릴리스 조회 |

사이트 자동 등록 CLI는 직원 브라우저 세션이 아닌 별도 배포 주체 인증을 사용합니다. 게이트 연결 전에는 위 경로를 배포하거나 공개하지 않습니다.

## 공개 SDK 설정 조회

GET /tracking-config?siteId=... 는 인증 없는 공개 데이터가 필요한 별도 경로입니다. 응답은 게시된 JSON만 포함합니다. 초안, 업체 내부 정보, 운영자, 로그, 비밀키를 반환하지 않습니다. siteId 형식 검증, rate limit, 허용 도메인/CORS 정책, ETag, Cache-Control, 게시 시 캐시 무효화가 필요합니다. 미게시 사이트는 404로 응답하고 빈 운영 설정을 임의 생성하지 않습니다.

## 오류와 동시성

관리자 API는 미인증/게이트 실패 401, 권한 부족 403, 버전 충돌 409, 입력 오류 400으로 구분합니다. 게시 작업은 Firestore 트랜잭션과 CDN 결과를 추적할 수 있어야 하며, 배포 실패 시 이전 공개 버전을 유지해야 합니다. API 인터페이스는 apps/admin/src/lib/adminGateway.ts에 선언돼 있고 실제 구현은 없습니다.
