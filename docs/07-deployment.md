# 운영 배포 및 복구

## 현재 배포

- Firebase 프로젝트: `landing-tracking`
- Hosting 사이트: `pixel-manager`
- 공개 주소: https://pixel-manager.web.app
- 배포 범위: Google Auth, Firestore Rules·인덱스, 관리자·공개 설정·진단 Functions 3개, 관리자 화면과 SDK 번들.

`firebase.json`은 Hosting 사이트와 빌드 경로를 고정하고 `/api/**`, `/tracking-config`, `/tracking-diagnostic`을 서울 리전 Functions로 연결한다. 그 외 화면 경로는 `index.html`로 보낸다. HTML은 매 요청 재검증하고 해시가 붙은 `/assets` 파일은 장기 캐시한다. 브라우저의 Firestore 직접 접근은 Rules로 차단한다.

2026-11-03 라이브 점검: `/` 200, 비로그인 `/api/workspace` 401, 미게시 `siteId`의 `/tracking-config` 404, `/sdk/landing-tracking-sdk.iife.js` 200. Edge에서 Google 로그인 버튼이 보이고 JavaScript 오류가 없었다. 실제 계정으로 로그인한 관리자 CRUD·게시 및 실사이트 SDK 매체 수신은 검증하지 않았다. 첫 Functions 배포 후 Artifact Registry 이미지의 7일 자동 정리 정책을 설정했다.

## 변경 배포

1. `npm ci`, `npm run typecheck`, `npm test`, `npm run test:api`, `npm run test:stack`, `npm run build`로 변경 범위를 검증한다.
2. API가 바뀌었다면 `firebase deploy --only functions --project landing-tracking --non-interactive`로 서버를 먼저 배포한다.
3. Rules 또는 화면이 바뀌었다면 `firebase deploy --only firestore,hosting --project landing-tracking --non-interactive`를 실행한다. 공개 설정 API와 관리자 API rewrite가 연결되는지 확인한다.
4. `/`, `/api/workspace`, `/tracking-config?siteId=<미게시ID>`, `/sdk/landing-tracking-sdk.iife.js`의 상태와 Edge 로그인 화면을 점검한다. 실제 계정으로 게시했다면 해당 `siteId`의 공개 설정도 확인한다.

CLI 명령의 대상 프로젝트는 `landing-tracking`이고 Hosting 사이트는 `pixel-manager`다. Functions 환경 파일 `functions/.env.landing-tracking`에는 `ADMIN_EMAIL`과 `ADMIN_ORIGIN`이 필요하며 커밋하지 않는다.

## 복구

Firebase Hosting 콘솔의 `pixel-manager` 릴리스 이력에서 이전 정상 버전을 선택해 Roll back한다. 또는 해당 버전 ID를 확인한 후 `firebase hosting:clone landing-tracking:pixel-manager@<버전ID> landing-tracking:pixel-manager:live`로 복제한다. 복구 후 같은 라이브 점검을 실행한다. Hosting 롤백에는 화면과 SDK 번들 및 rewrite 설정이 포함되지만 Functions 코드와 Firestore 데이터는 별도로 복구해야 한다. 게시 설정은 관리자 롤백 기능으로 새 릴리스를 발행한다.

20일차에는 라이브를 유지한 채 `rollback-drill` 미리보기 채널에 임시 변경 버전을 올리고, 이전 정상 버전 ID로 복제해 채널 포인터가 원래 버전으로 돌아가는 것을 확인했다. 새 사이트의 미리보기 URL이 404였으므로 이 리허설은 API의 버전 포인터까지만 확인했으며 미리보기 브라우저 렌더링이나 라이브 과거 버전 복구의 대체 검증은 아니다.

실제 랜딩 소스가 아직 제공되지 않아 SDK 삽입, 기존 태그와 실행 주체 정리, 문의 성공 후 `/complete` 토큰 처리와 매체 수신 검증은 사이트 적용 시 진행한다.
