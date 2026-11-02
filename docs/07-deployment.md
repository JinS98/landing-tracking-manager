# 정적 데모 배포 및 복구

## 현재 배포

- Firebase 프로젝트: `landing-tracking`
- Hosting 사이트: `pixel-manager`
- 공개 주소: https://pixel-manager.web.app
- 배포 범위: `apps/admin/dist` 정적 파일만. Firebase Auth, Firestore, Functions, SDK 번들, 운영 관리자 API는 배포하지 않는다.

`firebase.json`은 `site`와 `public`을 고정하고 React Router의 직접 경로 진입을 위해 `index.html` rewrite를 사용한다. HTML은 매 요청 재검증하고 해시가 붙은 `/assets` 파일은 장기 캐시한다. CSP는 현재 정적 데모에 필요한 자체 리소스만 허용한다. 서버 API·외부 자산을 추가할 때는 정책을 재검토한다.

## 변경 배포

1. `npm ci`, `npm run typecheck`, `npm test`, `npm run test:ui`, `npm run test:landing`을 실행한다.
2. `npm run build` 후 `npm run test:hosting`으로 로컬 Hosting 에뮬레이터를 확인한다.
3. `firebase hosting:channel:deploy <채널명> --project landing-tracking --expires 1d`로 미리보기 버전을 만든다.
4. 미리보기 주소가 정상 응답하고 화면 검증이 통과하면 `firebase hosting:clone landing-tracking:pixel-manager:<채널명> landing-tracking:pixel-manager:live`로 검증한 버전을 라이브에 복제한다. 최초 사이트 생성 당시 `day20` 미리보기 URL은 404였고, 채널의 확정된 버전을 라이브로 복제한 뒤 라이브 주소에서 검증했다. 이 예외를 이후 배포의 미리보기 검증 통과로 간주하지 않는다.
5. `node tests/hosting-smoke.test.mjs https://pixel-manager.web.app`으로 라이브의 응답·깊은 경로·Edge 렌더링을 확인한다.

CLI 명령의 대상은 `pixel-manager` Hosting 사이트 하나다. `firebase deploy` 전체 명령으로 Firestore Rules·인덱스까지 함께 배포하지 않는다.

## 복구

Firebase Hosting 콘솔의 `pixel-manager` 릴리스 이력에서 이전 정상 버전을 선택해 Roll back한다. 또는 해당 버전 ID를 확인한 후 `firebase hosting:clone landing-tracking:pixel-manager@<버전ID> landing-tracking:pixel-manager:live`로 복제한다. 복구 후 같은 라이브 점검 명령을 실행한다. Hosting 롤백은 정적 화면만 되돌리며 브라우저 메모리 상태와 미배포 서버·SDK 설정에는 영향을 주지 않는다.

20일차에는 라이브를 유지한 채 `rollback-drill` 미리보기 채널에 임시 변경 버전을 올리고, 이전 정상 버전 ID로 복제해 채널 포인터가 원래 버전으로 돌아가는 것을 확인했다. 새 사이트의 미리보기 URL이 404였으므로 이 리허설은 API의 버전 포인터까지만 확인했으며 미리보기 브라우저 렌더링이나 라이브 과거 버전 복구의 대체 검증은 아니다.

운영 관리자 기능과 광고 태그는 회사 게이트·실제 랜딩 검증을 거친 별도 배포 절차가 필요하다.
