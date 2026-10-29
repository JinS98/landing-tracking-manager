# Firestore 데이터 설계

현재 Firestore 연결과 배포된 Rules는 없습니다. firestore.rules는 브라우저 읽기/쓰기를 모두 거부하는 안전한 초안입니다. 다음은 서버 접근 제어 뒤에서 구현할 스키마 계약입니다.

| 컬렉션 | 주요 필드 | 정책 |
|---|---|---|
| companies/{companyId} | name, status, createdAt, updatedAt | 실제 업체명은 비공개 |
| sites/{siteId} | companyId, domain, environment, sdkStatus, createdAt, updatedAt | 전역 siteId 고유, 한 업체에 다수 사이트 |
| trackingConfigs/{siteId} | draft, draftVersion, publishedVersion, updatedAt | 초안 비공개, 버전 충돌 검사 |
| trackingReleases/{releaseId} | siteId, version, config, publishedAt, actorRef, sourceVersion? | 불변 이력, siteId+version 고유 |
| auditLogs/{logId} | siteId, action, actorRef, createdAt, beforeVersion, afterVersion | 추가 전용 |
| importJobs/{jobId} | source, status, createdCount, skippedCount, errorCount | 등록/업로드 작업 추적 |

siteId는 문서 ID이자 자동 등록의 멱등 키입니다. 재등록은 기존 trackingConfigs를 덮어쓰지 않고 도메인/업체 충돌을 명시적으로 보고해야 합니다. 같은 업체는 여러 사이트를 가질 수 있습니다. companyId, domain, environment의 조합도 서버에서 검증합니다.

## 설정 구조

- 공통: provider, enabled, trackingId, Naver WCS의 inflowDomain 등
- 전환: provider, enabled, event=consultation_complete, Google Ads sendTo, Naver conversionType, 기타 eventName
- provider: gtm, googleAds, naverWcs, karrot, meta, tiktok
- 임의 script 문자열, HTML, 비밀키, 개인정보 필드는 금지

초안과 릴리스는 분리합니다. 게시 시 허용 필드만 schemaVersion=1, siteId, releaseVersion, publishedAt, common, conversions 형태의 공개 JSON으로 투영합니다. 공개 JSON에는 감사 주체나 초안을 넣지 않습니다. SDK의 tracking-core 파서는 이 공개 계약을 검사합니다.

## 서버 트랜잭션과 인덱스

saveDraft는 expectedVersion을 비교하고 성공 시 draftVersion을 증가시킵니다. publish는 초안 검증, 릴리스 버전 증가, publishedVersion 갱신, auditLogs 추가를 원자적으로 처리합니다. rollback은 대상 릴리스를 복사해 새 버전으로 게시합니다. siteId+version 조회와 siteId+publishedAt 정렬에 필요한 인덱스를 계획합니다.

## Rules 원칙

브라우저 직접 쓰기를 모두 거부합니다. 초안·감사 로그·등록 작업의 익명 읽기도 거부합니다. 공개 SDK 조회는 별도 서버/CDN 경로로만 제공하고, Firestore 공개 읽기 규칙으로 대체하지 않습니다. 서버 서비스 계정은 최소 권한으로 운영합니다.
