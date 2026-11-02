# Landing Tracking Manager

광고주 랜딩마다 흩어진 광고 태그와 전환 설정을 사이트 단위로 관리하기 위한 독립형 MVP입니다. 사내 직원이 로그인 화면 없이 가상 업체를 선택하고 설정 변경 흐름을 시연할 수 있습니다. 현재 관리자 앱은 브라우저 메모리 데모이며 실제 광고주 데이터, 운영 ID, 운영 Firebase 쓰기, 광고 태그 실행은 포함하지 않습니다. 서버 등록 트랜잭션은 별도 로컬 에뮬레이터에서만 검증했습니다.

## 해결하려는 문제

랜딩마다 하드코딩된 스크립트는 매체 ID와 전환 조건을 수정할 때 배포와 중복 점검이 어렵습니다. 이 프로젝트는 업체 → 여러 사이트 → 초안 → 게시본의 경계를 만들고, 추후 회사 관리자 시스템의 접근 제어와 연결해 운영하려는 기반입니다.

## 핵심 아키텍처

- apps/admin: React 관리자 UI와 메모리 기반 데모 상태. 로그인 화면과 운영 쓰기 연결이 없습니다.
- packages/tracking-core: 공개 게시 설정의 타입과 허용 필드 검증.
- packages/tracking-sdk: 공개 게시 설정 로더, 중복 방지, 라우트 감지, 매체 어댑터 인터페이스. 실제 매체 어댑터는 아직 없습니다.
- functions: 향후 사내 접근 게이트 뒤의 관리자 쓰기 API와 공개 SDK 조회 API. 현재는 접근 검사와 서버 전용 사이트 등록 트랜잭션만 있으며 HTTP API는 없음.
- packages/landing-register: 배포 파이프라인용 등록 CLI. 기본 실행은 dry run이고 실제 API 연결은 미완료.

운영 단계에는 기존 회사 관리자 인증 게이트웨이와 필요 시 VPN/접근 프록시 → 서버 측 운영자 검증·세션·CSRF·권한 검사 → Firestore 쓰기/게시 순서가 필요합니다. SDK는 게시된 공개 설정만 조회합니다. 기존 MLeverage SDK와 별도 모듈이며 통합 지점을 남겨 둡니다.

## 워크스페이스 경계와 실행 명령

| 워크스페이스 | 현재 의존 방향 | 현재 실행 가능 범위 |
| --- | --- | --- |
| `@ltm/admin` | 다른 내부 패키지를 아직 직접 참조하지 않음 | `npm run dev`로 메모리 데모, `npm run build`로 관리자 정적 빌드 |
| `@ltm/tracking-core` | 내부 패키지 의존 없음 | 공개 게시 설정 타입과 검증 함수의 타입 검사 |
| `@ltm/tracking-sdk` | `@ltm/tracking-core` 사용 | SDK 소스 타입 검사. 배포 번들과 매체 어댑터는 미구현 |
| `@ltm/functions` | 서버 전용 Firebase Admin SDK 사용 | 접근 검사와 등록 트랜잭션의 타입 검사·로컬 에뮬레이터 테스트. HTTP API는 미구현 |
| `@ltm/landing-register` | 내부 패키지 의존 없음 | Node.js 22.14+ 등록 CLI의 입력 검사·dry run·향후 인증 API 요청 |

루트 `npm run typecheck`는 다섯 워크스페이스를 각각 검사합니다. `npm run build`는 현재 관리자 앱만 빌드합니다. 전체 워크스페이스 설치와 CLI·서버·테스트는 Node.js 22.14+를 기준으로 합니다.

## 현재 주요 기능

- 가상 업체 전체 검색, 업체별 여러 사이트 선택, siteId 중복을 막는 데모 등록
- `.xlsx` 첫 시트 열 매핑·미리보기·중복 건너뛰기·오류 보고를 제공하는 메모리 데모 일괄 등록. 서버 업로드 API는 미구현
- 대시보드의 업체·사이트·활성 매체·SDK 확인 현황 및 최근 변경 이력
- 6개 매체(GTM, Google Ads, Naver WCS, 당근, Meta, TikTok)의 공통 태그와 전환 이벤트 설정 추가·수정·비활성화·제거
- 초안과 데모 게시본 비교, 메모리 내 게시·롤백 및 이력
- 공개 설정 형식 검증과 SDK 런타임 뼈대. 매체별 실제 태그 실행은 미구현
- 배포 사이트 등록 CLI의 dry run, 서버 등록 트랜잭션의 로컬 에뮬레이터 검증. 운영 등록 API는 미구현

## 기술 스택과 이유

- React 19 + TypeScript: 설정 편집 상태와 매체별 입력을 타입으로 관리
- Vite 6: 빠른 로컬 실행과 정적 관리자 UI 빌드
- React Router: 업체·사이트·이력 화면 분리
- npm workspaces: 관리자, 공통 계약, SDK, 서버/CLI의 교체 가능한 경계
- Firebase/Firestore: 운영 저장소로 계획 중이며 현재 클라이언트 연결은 제거됨

## 실행과 데모

프로젝트 설치·실행은 Node.js 22.14+에서 진행합니다.

    npm install
    npm run dev

브라우저에서 http://localhost:5173 을 엽니다. 별도 계정이나 Firebase 설정은 필요하지 않습니다. 업체 관리에서 가상 사이트를 등록하고, 엑셀 일괄 등록에서 `.xlsx` 파일의 첫 시트를 미리 볼 수 있습니다. 엑셀 헤더 예시는 `companyId | companyName | siteId | domain`이며 ID와 도메인은 텍스트 셀로 입력합니다. 일괄 등록은 최대 2MB·500행의 데모이며 유효한 행만 메모리에 추가합니다. 설정 편집 → 미리보기 → 데모 게시 → 롤백도 시험할 수 있습니다. 새로고침하면 데모 상태가 초기화됩니다. apps/admin/.env.example의 플래그를 바꿔도 운영 쓰기는 활성화되지 않습니다.

등록 CLI dry run은 Node.js 22.14+에서 `npm run register -w @ltm/landing-register -- --site-id sample-site --company-id sample-company --domain landing.example --environment staging`으로 실행합니다. `--apply`는 회사의 인증된 등록 API가 마련된 뒤 배포 파이프라인에서만 사용합니다.

검증 명령:

    npm run typecheck
    npm run build
    npm test

Firestore Rules 로컬 검증에는 별도로 Firebase CLI와 Java 21이 필요합니다. 아래 명령은 `demo-landing-tracking-manager` 에뮬레이터에서만 익명 접근 거부를 검사합니다.

    npm run test:rules
    npm run test:registration

`test:registration`도 Firebase CLI·Java 21을 사용하며 `demo-` 에뮬레이터에서만 서버 등록 트랜잭션을 검사합니다.

## 회사 관리자 통합 계획

apps/admin/src/lib/adminGateway.ts의 인터페이스를 회사 관리자 API 어댑터로 구현합니다. functions/src/access.ts의 서버 측 게이트 검증·인가 인터페이스를 별도로 구현해야 합니다. 서버는 접근 게이트가 검증한 운영자 신원과 권한을 매 요청 확인하고, Firestore에서 버전 충돌 검사·감사 로그·게시/롤백을 처리합니다. 사이트 자동 등록은 별도 배포 주체의 인증으로만 허용합니다.

## 보안 제한과 미구현 항목

운영 API와 배포 주체의 실제 자격 증명 검증기, 배포된 Firestore Rules, CDN 게시, 6개 매체 어댑터, 실제 SDK 설치 진단은 아직 없습니다. 등록 CLI는 운영 API가 없으므로 현재 dry run과 모의 요청 테스트로만 사용할 수 있습니다. firestore.rules에는 브라우저 읽기/쓰기를 모두 거부하는 초안만 있습니다. 이 상태에서 운영 환경 배포나 실제 광고 전환 측정에 사용하면 안 됩니다. 로그인 UI가 없으므로 사내 접근 게이트가 연결되기 전까지 데모만 허용합니다. 개인정보와 실제 광고주 ID를 저장소에 올리지 않습니다.

설계·일정·운영 전 검증 항목은 docs/를 참조하세요.
