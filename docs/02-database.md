# Firestore 데이터 설계

## 현재 상태와 적용 범위

현재 관리자 화면은 브라우저 메모리 데모이며 Firestore에 연결하지 않습니다. `firebase.json`, `firestore.rules`, `firestore.indexes.json`은 로컬 검증과 향후 운영 구현을 위한 파일이고 실제 Firebase 프로젝트에는 배포되지 않았습니다. 5일차에 `registerSite`의 서버 전용 트랜잭션을, 12일차에 공개 설정의 서버 전용 Firestore 리더와 HTTP 핸들러를 구현해 로컬 에뮬레이터와 HTTP 테스트에서 검증했습니다. 7일차 엑셀 importJobs는 **메모리 데모만** 구현했습니다. 17일차에 초안 저장·게시·롤백의 서버 전용 Firestore 트랜잭션을 추가했습니다. 관리자 HTTP 라우트와 일괄 등록 HTTP API는 여전히 미구현입니다.

## 문서 ID와 관계

| 경로 | 문서 ID | 핵심 필드와 관계 | 노출 범위 |
| --- | --- | --- | --- |
| `companies/{companyId}` | 서버가 부여한 변경 불가 ID | `name`, `status`, `createdAt`, `updatedAt` | 관리자 전용 |
| `sites/{siteId}` | 전역 고유 `siteId` | `companyId` → companies, `domain`, `environment`, `status`, `sdkStatus`, `createdAt`, `updatedAt` | 관리자 전용 |
| `trackingConfigs/{siteId}` | sites와 동일 | `draft`, `draftVersion`, `publishedVersion`, `updatedAt`, `updatedBy` | 초안 포함, 관리자 전용 |
| `trackingReleases/{siteId}__v{version}` | 사이트·릴리스 버전으로 결정 | `siteId`, `version`, `config`, `publishedAt`, `actorRef`, `sourceDraftVersion`, `sourceVersion?` | 내부 이력. `config`만 공개 JSON의 원본 |
| `auditLogs/{logId}` | 서버 생성 ID | `siteId`, `action`, `actorRef`, `createdAt`, `beforeVersion`, `afterVersion`, `summary` | 관리자 전용, 추가 전용 |
| `importJobs/{jobId}` | 서버가 검증한 파일 내용·열 매핑의 멱등 키 | `source`, `status`, `createdCount`, `skippedCount`, `errorCount`, `createdAt`, `updatedAt`, `actorRef`, `fileDigest`, `mappingDigest` | 관리자/배포 주체 전용. 현재는 Firestore 미구현 |

`createdAt`, `updatedAt`, `publishedAt`은 서버 저장 시 Firestore Timestamp를 사용합니다. 12일차 공개 리더는 릴리스의 Timestamp를 ISO 8601 문자열로 변환합니다. 현재 데모의 문자열 시각과 서버 저장 형식은 구분합니다. 업체 한 곳에 사이트 여러 개가 속합니다. 삭제·이관 정책은 미정이며 운영 구현 전에 정해야 합니다.

`siteId`는 데모와 동일하게 소문자·숫자·하이픈 2~63자로 제한할 계획입니다. `sites/{siteId}` 생성은 서버 트랜잭션에서 **기존 문서가 없을 때만** 수행하고, 재시도 시 동일한 입력이면 기존 사이트를 반환하며 업체·도메인·환경이 다르면 충돌을 보고합니다. 기존 `trackingConfigs/{siteId}`는 재등록으로 덮어쓰지 않습니다. `companyId + domain + environment`의 중복 정책은 별도 운영 결정이 필요하며, 쿼리 조회만으로 동시 등록의 고유성을 보장한다고 가정하지 않습니다.

릴리스 문서 ID `siteId__v{version}`은 같은 사이트·버전의 중복 생성을 막기 위한 결정적 키입니다. 복합 인덱스는 조회를 돕지만 고유 제약은 제공하지 않으므로 게시 시 트랜잭션에서 `publishedVersion`을 확인하고 해당 릴리스 문서를 새로 생성해야 합니다.

## 초안과 공개 설정

`trackingConfigs/{siteId}.draft`는 `siteId`, `version`, `common[]`, `conversions[]`를 가진 관리자 편집본입니다. `draftVersion`은 `draft.version`과 같아야 하며 낙관적 잠금 값으로 사용합니다. 매체는 GTM, Google Ads, Naver WCS, 당근, Meta, TikTok의 `gtm`, `googleAds`, `naverWcs`, `karrot`, `meta`, `tiktok`입니다. 공통 설정은 `id`, `provider`, `enabled`, `trackingId`와 매체별 허용 필드, 전환 설정은 `id`, `provider`, `enabled`, `event=consultation_complete`와 `sendTo`·`conversionType`·`eventName` 중 매체별 허용 필드만 갖습니다.

게시는 초안을 검증하고 `schemaVersion=1`, `siteId`, `releaseVersion`, `publishedAt`, `common`, `conversions`만 공개 JSON으로 투영합니다. `packages/tracking-core/src/index.ts`의 `parseDraftConfig`, `projectPublishedConfig`, `parsePublishedConfig`가 초안 저장·투영·공개 JSON 읽기에 같은 매체 규칙을 적용합니다. 활성 전환에는 활성 공통 설정을 요구하며 허용되지 않은 필드와 임의 JavaScript/HTML은 거부합니다. 업체명, 내부 도메인 정책, 초안, `actorRef`, 감사 로그, 비밀키, 개인정보는 공개 JSON에 넣지 않습니다. 이 투영은 **브라우저 메모리 데모 게시**와 **12일차 공개 HTTP 응답**에서 실행됩니다. 서버 전용 게시 트랜잭션은 구현됐지만 관리자 HTTP 라우트와 CDN 배포는 아직 없습니다.

## 서버 트랜잭션 계약

1. `registerSite`: 서버에서 업체와 입력을 확인하고 `sites/{siteId}`의 존재 여부를 트랜잭션으로 검사합니다. 재시도는 멱등 처리하며 다른 소유 업체·도메인·환경은 충돌로 끝냅니다. 신규 사이트에만 빈 초안과 감사 로그를 만듭니다.
2. `saveDraft`: 요청의 `expectedVersion`과 저장된 `draftVersion`을 비교한 후 허용 필드·매체 관계를 검증합니다. 일치할 때만 버전을 1 증가시키고 감사 로그를 추가합니다.
3. `publish`: 같은 트랜잭션에서 초안 버전 확인, 다음 `publishedVersion` 계산, 결정적 ID의 릴리스 생성, 설정 포인터 갱신, 감사 로그 추가를 처리합니다. CDN 정적 JSON 배포는 아직 없으며, 도입 시 Firestore 트랜잭션 밖에서 버전별 결과물 선배포·캐시 무효화·실패 상태를 관리해야 합니다.
4. `rollback`: 공개 포인터의 `expectedPublishedVersion`을 검사하고 대상 릴리스 내용을 **새 버전**으로 복사합니다. `sourceVersion`에 대상 버전을 기록하고 초안도 대상 내용으로 갱신합니다. 기존 릴리스는 변경하지 않습니다.

등록·초안·게시·롤백 트랜잭션은 [Firebase 트랜잭션 지침](https://firebase.google.com/docs/firestore/manage-data/transactions)에 따라 모든 문서 읽기를 쓰기 전에 수행하고, 재시도될 수 있는 콜백 안에서 외부 API 호출이나 로그 전송 같은 부수 효과를 실행하지 않습니다.

현재 `apps/admin/src/lib/demoWorkspace.ts`는 메모리 데모 동작을 보여 주며 서버 트랜잭션·동시성·CDN 배포를 보장하지 않습니다. 별도 `functions/src/registerSite.ts`의 사이트 등록은 로컬 에뮬레이터에서 멱등성·동시 요청·초안 보존을 시험했습니다. `functions/src/publicConfig.ts`의 공개 리더도 로컬 에뮬레이터에서 게시 포인터와 릴리스 조회를 검증했습니다. 초안 버전 관리와 게시·롤백 트랜잭션은 `functions/src/releaseWorkflow.ts`에서 구현하고 로컬 에뮬레이터로 검증했습니다. 실제 회사 게이트·관리자 HTTP·운영 IAM·Firestore 배포는 아직 필요합니다.

## 7일차 일괄 등록 계약

데모는 `.xlsx` 첫 시트의 `companyId`, `companyName`, `siteId`, `domain` 네 열을 사용자가 연결해 최대 500개 데이터 행을 미리 봅니다. 파일은 브라우저에서만 읽고, `importJobs` 이력도 메모리에만 둡니다. 기존 업체의 이름이 다르거나 기존 siteId가 다른 업체·도메인을 가리키면 오류로 표시합니다. 같은 siteId·업체·도메인은 건너뛰며 기존 `trackingConfigs`를 수정하지 않습니다. 새 업체와 사이트는 유효한 행만 추가합니다. 같은 파일 내용과 열 매핑의 재적용은 작업 ID로 멱등 처리합니다. 페이지 새로고침 후 이 데모 이력은 사라집니다.

운영 구현에서는 인증된 관리자만 미리보기와 확정을 요청합니다. 서버가 파일 크기·형식·행 수·열 매핑·모든 필드를 다시 검사하고 파일 및 매핑 digest를 구합니다. 미리보기 결과는 확정 시점의 쓰기 권한이나 siteId 고유성 보장이 아닙니다. 확정 요청은 파일 digest·매핑 digest·검증된 actor에 묶인 작업 ID를 사용하고, 서버가 `importJobs/{jobId}`를 트랜잭션으로 선점해 동시 재요청을 막아야 합니다. 각 업체·사이트 생성은 서버 트랜잭션에서 현재 문서를 다시 읽고 충돌을 판정합니다. 동일한 사이트 재시도는 건너뛰고 초안·릴리스를 보존합니다. 작업 상태는 `running` → `completed`/`partial`/`failed`로 기록하고, 행별 오류는 관리자 전용 결과로 제한합니다. 원본 파일·운영 자격 증명·광고주 개인정보를 공개 설정이나 감사 로그에 복사하지 않습니다. 이 운영 흐름과 회사 생성 권한 정책은 아직 구현되지 않았습니다.

## 18일차 감사 조회와 진단 경계

`functions/src/auditHistory.ts`는 사이트 범위 `readHistory` 인증·인가 후 최신 감사 항목을 최대 100건 읽습니다. 서버 트랜잭션에서 기록된 `actorRef`, 전후 버전, `createdAt`을 반환하며 공개 SDK 설정에는 넣지 않습니다. 이 함수는 서버 전용이며 관리자 HTTP 라우트와 실제 회사 게이트는 미연결입니다. 브라우저 화면의 데모 감사 항목은 `demo-operator`로 표시되고 Firestore 항목과 혼합하지 않습니다.

현재 진단 신호를 수집하거나 저장하는 Firestore 컬렉션은 없습니다. `sites.sdkStatus`의 데모 예시 값은 운영 설치 증거가 아닙니다. 실제 수집을 도입할 때는 검증된 사이트 매핑과 서버 수신 시각을 기준으로 상태를 계산하고, 관측이 없으면 `unknown`을 유지해야 합니다. 완료 토큰과 문의 정보, URL 쿼리, 광고 식별자는 진단 저장 대상에서 제외합니다.

## 계획된 조회와 인덱스

`firestore.indexes.json`에는 다음 **후속 API용 조회 계획**을 명시했습니다. 실제 운영 인덱스의 배포·빌드 상태는 확인되지 않았습니다.

| 조회 | 계획된 필터·정렬 | 인덱스 |
| --- | --- | --- |
| 업체별 사이트 | `companyId ==` + `createdAt desc` | `sites(companyId asc, createdAt desc)` |
| 사이트별 릴리스 목록 | `siteId ==` + `version desc` | `trackingReleases(siteId asc, version desc)` |
| 사이트별 변경 이력 | `siteId ==` + `createdAt desc` | `auditLogs(siteId asc, createdAt desc)` |

단일 사이트와 특정 릴리스 버전은 문서 ID로 직접 읽습니다. 업체명 전체 검색과 전체 대시보드 집계의 운영 쿼리·인덱스는 API 설계 시 결정합니다. Firestore 복합 인덱스는 쿼리 실행용이며 고유성 검증 수단이 아닙니다. [Firebase 인덱스 개요](https://firebase.google.com/docs/firestore/query-data/index-overview), [인덱스 설정 형식](https://firebase.google.com/docs/reference/firestore/indexes)을 기준으로 작성했습니다.

## 접근 정책과 로컬 검증

`firestore.rules`의 재귀 경로 규칙은 모든 클라이언트 읽기·쓰기를 거부합니다. 공개 SDK 조회는 Firestore 직접 읽기가 아닌 별도 서버/CDN에서 게시 JSON만 제공합니다. 서버 SDK는 Rules를 통과하지 않으므로 IAM, 사내 게이트, 요청별 인가가 필요합니다. [Firebase Rules 조건 문서](https://firebase.google.com/docs/firestore/security/rules-conditions)를 참조하세요.

`npm run test:rules`는 `demo-` 프로젝트의 로컬 Firestore 에뮬레이터에서 익명 REST 문서 조회·목록·생성·수정·삭제와 중첩 경로를 검사합니다. `firebase.json`이 Rules를 명시하므로 에뮬레이터 기본 공개 규칙에 의존하지 않습니다. 이 검증은 운영 Rules 배포, 서버 IAM, 인증된 클라이언트, 인덱스 빌드를 대체하지 않습니다.
