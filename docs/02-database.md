# Firestore 데이터 설계 (초안)

```text
companies/{companyId}: name, status, createdAt, updatedAt
sites/{siteId}: companyId, domain, environment, sdkStatus, createdAt
trackingConfigs/{siteId}: draft, publishedVersion, updatedAt
trackingReleases/{releaseId}: siteId, version, commonScripts, conversionScripts, publishedAt, publishedBy
auditLogs/{logId}: siteId, action, actorId, createdAt
importJobs/{jobId}: status, createdCount, updatedCount, skippedCount
```

## 타입
- `Provider`: gtm | googleAds | naverWcs | karrot | meta | tiktok
- `CommonScript`: provider, enabled, trackingId, inflowDomain?
- `ConversionScript`: provider, enabled, event, sendTo? | conversionType? | eventName?
- 실제 구현에서는 provider별 판별 유니언 및 서버 검증 스키마(Zod 등) 적용.

## 데이터 정책
- 업체명은 표시용; siteId와 검증된 도메인으로 중복 방지.
- 재등록/엑셀 업로드는 기존 trackingConfigs를 덮어쓰지 않음.
- 초안은 비공개, 게시된 버전만 공개 설정 API에 노출.
- 운영 배포와 변경 로그는 불변 기록을 권장.
