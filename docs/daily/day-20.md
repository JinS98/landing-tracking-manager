# 20일차 — 운영 배포 및 문서화

이 문서는 20일차 당시의 정적 데모 배포·검증 기록입니다. 아래 작업 메모는 당시 상태를 보존합니다. 이후 라이브 전환 결과는 다음 절과 [운영 배포 문서](../07-deployment.md)에 기록했습니다.

## 2026-11-03 라이브 전환

- `landing-tracking`의 Blaze 결제 연결 확인 후 서울 리전 Functions 3개(관리자 API, 공개 설정, 진단)를 배포하고 Artifact Registry 이미지 7일 자동 정리 정책을 적용했다.
- Firestore Rules·인덱스, 운영 관리자 화면, SDK 번들을 Hosting 사이트 `pixel-manager`에 배포했다. 주소는 https://pixel-manager.web.app 이다.
- 라이브 HTTP에서 `/` 200, 비로그인 `/api/workspace` 401, 미게시 설정 `/tracking-config` 404, SDK 번들 200을 확인했다. Edge에서 Google 로그인 화면과 JavaScript 오류 없음도 확인했다.
- 실제 관리자 계정으로 로그인한 CRUD·게시·롤백과 랜딩 사이트의 SDK 삽입·광고 매체 수신은 검증하지 않았다. 랜딩 소스는 사용자가 추후 제공하며 SDK 설치는 사용자가 진행한다.
- Google 로그인 버튼의 `auth/internal-error`를 새 브라우저에서 재현해 CSP가 `apis.google.com`을 차단하는 것을 확인했다. 앱 도메인에 맞는 `authDomain`·OAuth 콜백과 최소 CSP 허용을 배포했다. 새 Edge 세션에서 Google 계정 선택 화면까지 열리고 브라우저 오류가 없는 것을 확인했다. 실제 계정 로그인 후 API 흐름은 아직 확인하지 않았다.

## 개발 목표

검증 결과를 바탕으로 운영 배포 여부를 결정하고 인수 문서를 정리한다.

## 구현 기능

- 접근 게이트
- Rules
- CDN
- 롤백
- README/운영 절차

## 수정 또는 생성할 파일

- README.md
- docs/00-overview.md
- docs/05-security.md
- docs/06-test-plan.md

## 구체적인 작업 순서

1. 미완료 항목 확인
2. 보안·성능·태그 검증
3. 배포/롤백 리허설
4. 상태 문서화

## 테스트 방법

- 전체 타입/빌드/서버·SDK 통합 테스트와 운영 체크리스트

## 완료 체크리스트

- [x] 필수 게이트 통과 전에는 MVP 운영 완료로 표시하지 않음
- [x] 변경 내용과 테스트 결과를 이 문서에 기록

## 다음 일차 작업과의 연관성

이후 회사 관리자 시스템 통합과 운영 모니터링으로 이어진다.

## 작업 메모

- 배포 범위: Firebase 프로젝트 `landing-tracking`의 Hosting 사이트 `pixel-manager`에 관리자 정적 빌드만 배포했다. 라이브 주소는 https://pixel-manager.web.app 이다. 요청한 `landing-tracking.web.app`은 Firebase의 전역 이름 검사에서 다른 프로젝트에 예약되어 거부됐고, `script-manager`도 사용 중이었다. `pixel-manager`는 사용 가능해 사용자의 후보 선택에 따라 만들었다. 프로젝트 생성 시 할당된 기본 사이트 `landing-tracking-d92d0`에는 라이브 배포하지 않았다.
- 배포 순서: `npm run build` → 로컬 Hosting 에뮬레이터 검증 → `pixel-manager`의 `day20` 미리보기 채널 업로드 → 동일 버전 `725886a1a6eb9ed1`을 라이브 채널로 복제했다. 새 사이트 미리보기 URL은 배포 직후 404를 반환했으나 채널 API에는 릴리스가 저장됐고, 라이브 복제 후 실제 라이브 URL의 HTTP·Edge 검증이 통과했다. 미리보기 URL의 404 원인은 확인하지 못했으며 같은 주소에서의 정상 접속을 확인했다고 기록하지 않는다.
- 라이브 검증: `/`와 `/sites/coffee-main`이 200으로 정적 앱을 제공하고, Edge에서 대시보드와 사이트 상세가 렌더링되며 JS 오류가 없었다. HTML은 `no-cache`, 해시 자산은 `immutable` 캐시이며 CSP·Referrer-Policy·nosniff 헤더를 확인했다. Firebase 구성 파일은 공개 JSON으로 제공되지 않는다.
- 전체 검증: `npm run typecheck`, `npm run build`, `npm test` 63건, `npm run test:ui` 3건, `npm run test:landing` 6건, `npm run test:hosting` 2건, `npm run test:rules`, `npm run test:registration`, `npm run test:public-config`, `npm run test:release`가 통과했다. Firestore 테스트는 로컬 `demo-` 에뮬레이터만 대상으로 했다.
- 배포하지 않은 항목: Firestore Rules·인덱스, 관리자/공개 HTTP API, 회사 인증 게이트, SDK 브라우저 번들, 진단 수집, 광고 매체 픽셀과 실제 랜딩 연동. 사이트 등록·게시·롤백은 공개 화면에서도 브라우저 메모리 데모로만 실행되며 새로고침 시 초기화된다. 운영 Firestore 쓰기와 광고 플랫폼 호출은 없다.
- 롤백 리허설: 라이브 채널은 유지하고 `rollback-drill` 미리보기 채널에 임시 HTML 변경 버전 `c62cf213e7a00d8a`를 배포했다. 이전 정상 버전 `725886a1a6eb9ed1`을 버전 ID로 다시 복제하고 채널 API에서 `rollback-drill`과 `live`가 모두 정상 버전을 가리키는 것을 확인했다. 로컬 빌드 결과물의 임시 변경은 다시 빌드해 제거했다. 미리보기 URL의 브라우저 렌더링과 라이브 채널의 과거 버전 복구는 검증하지 않았다.
- 운영 판정: 접근 게이트와 서버 인가·CSRF, 운영 Rules/IAM, 공개 설정 배포·캐시·롤백, 실제 랜딩의 단일 태그 실행 주체·매체 수신이 확인되기 전까지 운영 MVP는 보류한다. 정적 화면 배포와 운영 기능 배포를 구분한다. 배포·복구 절차는 `docs/07-deployment.md`에 기록했다.
