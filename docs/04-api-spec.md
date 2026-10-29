# API 명세 초안

## POST /registerSite (인증 필수)
입력: `{siteId, companyName, domain, environment}`
- 배포 CLI의 서버 인증 확인, 도메인 검증, idempotent upsert
- 기존 스크립트 설정 보존

## GET /tracking-config?siteId=...
- 게시된 공개 설정만 반환, 비밀값 제외
- Cache-Control/ETag, 사이트별 환경 구분, 과도한 요청 제한
- 초안·감사 로그는 반환 금지

## POST /publishConfig (관리자 인증 필수)
입력: `{siteId, expectedVersion, draft}`
- 역할 검증, 매체별 설정 유효성 검증
- 원자적 버전 증가, 감사 로그, 캐시 무효화

## POST /rollbackConfig (관리자 인증 필수)
입력: `{siteId, targetVersion}`
- 권한 검증, 변경 이력 기록, 이전 게시본 복원

> 이 API들은 명세만 작성되었고 현재 서버 코드는 구현되지 않았습니다.
