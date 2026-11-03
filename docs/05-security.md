# 보안 및 개인정보 정책

## 데모와 운영의 경계

로컬 데모는 브라우저 메모리만 사용한다. 운영 빌드는 Firebase Google 로그인과 관리자 API를 사용한다. 서버는 Firebase ID 토큰을 검증하고 `ADMIN_EMAIL`과 일치하는 Google 계정만 허용한다. 브라우저의 Firestore 직접 읽기·쓰기는 배포된 Rules로 차단한다.

20일차에는 https://pixel-manager.web.app 에 정적 데모만 공개했으나, 2026-11-03에 운영 화면·SDK 번들·Functions·Firestore Rules·인덱스를 배포했다. 비로그인 관리자 API가 401을 반환하는 것을 확인했다. Google 로그인 화면은 Edge에서 오류 없이 표시됐으나, 실제 계정의 로그인·쓰기·게시 흐름은 아직 수동 검증이 필요하다. 관리자 데이터는 서버 API에서만 취급한다.

`firebase.json`은 운영 Rules·인덱스와 Functions·Hosting을 연결한다. `npm run test:rules`는 로컬 `demo-landing-tracking-manager`에서 익명 Firestore 접근 거부를 검사했다. 실제 프로젝트에는 Rules를 배포했지만 인증된 브라우저의 직접 접근 거부 및 서버 서비스 계정의 최소 권한은 별도 점검이 필요하다. Firestore 서버 SDK는 Rules를 우회하므로 API의 토큰·계정 검증이 중요하다. [Firebase Rules 조건](https://firebase.google.com/docs/firestore/security/rules-conditions), [에뮬레이터 구성](https://firebase.google.com/docs/emulator-suite/install_and_configure)을 기준으로 한다.

## 접근 제어

운영 관리자 인증은 Firebase Google 로그인으로 정했다. 서버는 ID 토큰의 서명·만료·철회, 이메일 검증 여부, Google 제공자, 정확한 관리자 이메일을 확인한다. 브라우저가 보낸 신원 헤더만으로 운영자를 인정하지 않는다. 쓰기 요청은 `ADMIN_ORIGIN`과 `Origin` 일치를 요구한다. 현재 단일 관리자 계정이 모든 사이트를 관리하며 직원별 사이트 권한 UI는 없다.

`functions/src/access.ts`의 검사 조합은 검증기·CSRF 검사기·인가자 중 하나라도 없으면 503으로 거부한다. 운영 구현은 `functions/src/adminServer.ts`의 Firebase 검증기를 사용한다. 로컬 테스트는 위조 헤더·만료 세션·CSRF 실패 등을 확인했고, 라이브에서는 비로그인 401을 확인했다. 로그인한 운영자의 403·쓰기 요청과 IAM 최소 권한, 요청 속도 제한은 추가 검증이 필요하다.

공개 설정 HTTP 함수는 관리자 쓰기 경로와 독립적이며 Firestore 게시 포인터와 불변 릴리스만 서버에서 읽는다. 공개 DTO 투영이 실패하면 오류로 거부하며 초안·감사 로그·운영자 필드를 응답하지 않는다. 등록된 HTTPS 도메인에만 CORS 허용 헤더를 보내지만 CORS는 서버 간 조회를 막는 인증 수단이 아니다. Hosting rewrite로 HTTPS 경로를 제공하며 요청 속도 제한과 실제 게시본 조회는 추가 검증이 필요하다.

## 5일차 배포 주체 경계

등록 CLI의 `--apply`는 HTTPS 전용 경로와 배포 환경의 별도 Bearer 자격 증명을 요구합니다. 직원 브라우저 쿠키를 사용하지 않으며 URL·로그에 토큰을 출력하지 않습니다. 서버 `registerSiteFromDeployment`는 검증기가 없거나 만료·대상 서비스가 다른 주체를 거부합니다. 실제 서명·발급자·허용 사이트 범위를 검증할 `DeploymentVerifier`와 HTTP 라우트는 **미구현**입니다. 로컬 Firestore 트랜잭션 테스트는 가상 배포 주체를 주입한 검증이며 운영 인증을 증명하지 않습니다. 서비스 계정은 서버에서만 사용하고 IAM 최소 권한과 키 관리가 필요합니다. [Firebase Admin SDK 설정](https://firebase.google.com/docs/admin/setup), [서버 SDK와 Rules 경계](https://firebase.google.com/docs/firestore/security/rules-conditions)를 참조하세요.

## 운영 전 필수 조건

- [x] Firebase Google 로그인과 서버의 ID 토큰·관리자 이메일 검증 구현
- [x] 비로그인 관리자 API의 라이브 401 확인
- [ ] 실제 관리자 계정으로 로그인·쓰기·게시·롤백과 권한 없는 계정의 403 검증
- [ ] Origin 검사, 세션 철회, rate limit, 감사 로그의 운영 동작 검증
- [x] Firestore Rules 배포 및 에뮬레이터에서 직접 접근 거부 테스트
- [ ] 인증된 브라우저의 운영 Firestore 직접 접근 거부 확인
- [ ] 서비스 계정 키·토큰을 Vite 환경변수/공개 JSON/저장소에 포함하지 않음
- [ ] 등록 CLI는 배포 주체 자격 증명과 siteId 멱등성 검사 사용
- [ ] 배포 주체 토큰의 서명·발급자·대상·만료·사이트 범위와 API 직접 우회 차단 검증
- [ ] 모든 매체 ID와 이벤트명 서버 검증; 임의 JS/HTML 저장·실행 금지
- [ ] 게시 JSON에 비밀값, 실제 광고주 PII, 내부 직원 정보가 없는지 검사
- [ ] 기존 하드코딩/GTM 내부 태그와 중복 실행 점검
- [ ] 기존 next/script 공통 태그·완료 페이지 전환·GTM과 신규 SDK의 실행 주체를 매체/이벤트별로 한 곳에 배정
- [ ] 기존 완료 페이지와 신규 SDK의 sessionStorage 키가 서로 달라도 중복 전송되지 않도록 단일 실행 주체로 제어
- [ ] 동의 관리, CSP, 개인정보처리방침, 플랫폼별 정책 검토
- [ ] CDN 캐시/롤백 실패 시 이전 게시본 유지와 감사 가능성 확인
- [ ] SDK 장애가 문의 접수 흐름을 막지 않는지 검증

포트폴리오 공개에는 가상 업체·도메인·ID만 사용합니다. 운영 데이터 덤프나 실제 광고 매체 식별자를 커밋하지 않습니다. 현재 SDK의 DOM 검사만으로 기존 인라인 태그를 완전히 판별할 수 없으므로 실제 사이트별 태그 인벤토리가 필요합니다.

**참고 코드 확인:** 사용자 제공 기존 랜딩 사례에는 /complete?token 및 sessionStorage 중복 방지가 있습니다. **실제 저장소 코드 확인:** 신규 SDK에도 별도의 sessionStorage 시도 키가 있습니다. 두 키의 공존은 매체별 단일 전송을 보장하지 않습니다. **운영 환경 검증 필요:** 실제 토큰의 생성·검증·만료·URL 노출 정책과 광고 플랫폼 수신 결과를 확인합니다. SDK는 단일 유효 랜덤 token으로 `/complete`에 방문하면 전환을 시도합니다. 랜딩은 실제 문의 성공 후에만 token을 발급하고 이동해야 합니다. token은 접수 성공의 서버 증명이 아니며, 필요하면 선택적 `verifyCompletionToken`으로 추가 검증합니다. URL 노출·재사용 정책은 운영 환경에서 정합니다.

## 1일차 공개 이력 점검

현재 파일의 ID 형태 값은 데모용이지만 초기 커밋 27c5c8b의 관리자 파일에는 이전 업체 식별자 형태의 값이 남아 있습니다. 비공개 저장소를 포트폴리오용으로 공개하기 전에는 전체 Git 이력을 검사하고, 가상 데이터만 있는 깨끗한 이력 또는 별도 저장소를 사용해야 합니다. 커밋 메시지만 재작성했으며 해당 파일 내용은 변경하지 않았습니다.
