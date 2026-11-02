# Landing Tracking Manager

업체별 여러 랜딩 사이트의 광고 매체 설정을 초안·게시본으로 관리하고, 랜딩 SDK가 게시본만 읽는 도구입니다. 문의·페이지뷰용 기존 SDK와 매체 픽셀용 SDK는 별개입니다.

## 현재 상태

- Firebase 프로젝트 `landing-tracking`에 서울 리전 Firestore 기본 데이터베이스와 브라우저 직접 접근을 차단하는 Rules·인덱스를 만들었습니다.
- 관리자 Google 로그인, 계정 제한, 업체·사이트 등록, 엑셀 일괄 등록, 초안 저장, 게시·롤백, 감사 이력, 공개 설정 및 SDK 진단 HTTP 함수의 코드를 연결했습니다. 로컬 에뮬레이터 통합 테스트는 통과했습니다.
- `npm run build`는 운영 관리자 화면과 `/sdk/landing-tracking-sdk.iife.js` 번들을 만듭니다.
- **Functions와 새 관리자 화면은 아직 라이브에 배포되지 않았습니다.** 프로젝트의 Blaze 결제 연결 전에는 Firebase Authentication 초기화와 Cloud Functions 배포가 불가능합니다. 현재 `https://pixel-manager.web.app`은 이전 정적 데모입니다.
- 실제 랜딩 소스는 이 저장소에 없습니다. 랜딩에 SDK와 문의 성공 처리 코드를 넣는 작업은 사이트 담당자가 수행합니다.

## 구성

| 경로 | 역할 |
| --- | --- |
| `apps/admin` | React 관리자 화면. 로컬 개발은 메모리 데모, 운영 빌드는 Firebase 로그인과 관리자 API 사용 |
| `functions` | Firebase ID 토큰 검증, Firestore 관리자 API, 게시 설정 공개 API, 진단 수신 |
| `packages/tracking-core` | 초안·공개 설정 검증과 DTO |
| `packages/tracking-sdk` | 게시 설정 로드, 6개 매체 어댑터, `/complete` 전환 및 탭 세션 중복 방지 |
| `packages/landing-register` | 배포 파이프라인 등록 CLI. 현재 기본은 dry run |

운영 흐름은 **업체 등록 → 사이트 등록 → 매체 초안 저장 → 게시 → 랜딩 SDK 설치**입니다. SDK는 `tracking-config`의 게시본만 읽습니다. 완료 페이지 전환은 문의 성공 후 만든 랜덤 토큰을 같은 탭 세션에서 확인하고, SDK가 세션 중복 전송을 막습니다. 설치 예시는 [운영 연결 가이드](docs/08-live-integration.md)에 있습니다.

## 개발과 검증

Node.js 22.14+가 필요합니다.

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run test:ui
npm run test:landing
npm run build
```

Firestore 에뮬레이터 테스트는 Firebase CLI와 Java 21이 필요합니다.

```sh
npm run test:rules
npm run test:registration
npm run test:public-config
npm run test:release
npm run test:api
npm run test:hosting
```

로컬 `npm run dev`는 `http://localhost:5173`에서 메모리 데모를 엽니다. 운영 빌드는 `apps/admin/.env.production`의 공개 Firebase Web 앱 설정으로 로그인 화면을 표시합니다. 실제 API는 서버에서 검증한 Google 계정만 사용할 수 있고 Firestore 클라이언트 읽기·쓰기는 차단됩니다.

## 배포

Blaze 연결과 Firebase Authentication의 Google 제공자 활성화가 끝나면 Functions·Firestore·Hosting을 배포합니다. 서버의 `ADMIN_EMAIL`은 배포 환경에서만 설정하며 저장소에 커밋하지 않습니다. 명령과 랜딩 설치 절차는 [운영 연결 가이드](docs/08-live-integration.md)에 있습니다. 20일차 정적 데모의 당시 상태는 [배포 기록](docs/07-deployment.md)에 남겨 두었습니다.
