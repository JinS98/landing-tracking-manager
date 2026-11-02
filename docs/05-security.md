# 보안 및 개인정보 정책

## 데모와 운영의 경계

로그인 화면이 없는 데모는 인증이 없는 운영 서비스가 아닙니다. 현재 브라우저 메모리 외에는 쓰지 않으며 VITE_DEMO_MODE 값을 바꿔도 운영 모드가 열리지 않습니다. Firebase 클라이언트 Auth/Firestore 연결은 제거했습니다. firestore.rules의 초안은 브라우저 읽기/쓰기를 모두 거부하며 아직 배포되지 않았습니다. 운영 편의를 위해 공개 쓰기로 완화하지 않습니다.

`firebase.json`은 Rules와 인덱스 파일 및 로컬 에뮬레이터만 연결합니다. `npm run test:rules`는 `demo-landing-tracking-manager` 프로젝트에서 여섯 컬렉션의 익명 REST 조회·목록·생성·수정·삭제와 중첩 경로 거부를 검사했습니다. 이는 **로컬 Rules 검증**이며 실제 Firebase 프로젝트의 배포 상태나 서버 IAM 설정을 증명하지 않습니다. Firestore 서버 SDK는 Rules를 우회하므로 회사 게이트, 요청별 인가, 서비스 계정 최소 권한을 서버 구현에서 별도로 검증해야 합니다. [Firebase Rules 조건](https://firebase.google.com/docs/firestore/security/rules-conditions), [에뮬레이터 구성](https://firebase.google.com/docs/emulator-suite/install_and_configure)을 기준으로 합니다.

## 4일차 접근 제어 계약

기존 회사 관리자 인증 게이트웨이를 운영자 신원의 기준으로 연결할 계획입니다. VPN·접근 프록시는 도달 가능한 네트워크를 줄이는 추가 방어로 사용합니다. 실제 게이트와 세션 방식이 확인되지 않았으므로 신원 assertion, 서명 키, 프록시 신뢰 목록, CSRF 토큰 저장 방식은 아직 확정하지 않습니다. 게이트가 브라우저의 신원 헤더를 제거·덮어쓰고, API로 직접 우회 진입할 수 없도록 네트워크에서 막아야 합니다. 서버는 전달된 헤더의 존재만으로 신원을 인정하지 않습니다. [OWASP 신원 전달 지침](https://cheatsheetseries.owasp.org/cheatsheets/Identity_Propagation_Patterns_Cheat_Sheet.html)을 참조합니다.

`functions/src/access.ts`의 접근 검사 조합 함수는 검증기·CSRF 검사기·인가자 중 하나라도 없으면 503으로 거부합니다. 완전한 운영자 컨텍스트와 만료되지 않은 세션을 요구하고, 쓰기에서는 CSRF 검사 후 자원 범위를 인가합니다. 현재 7개의 **모의 구현 테스트**가 익명/위조 헤더, 만료 세션, CSRF 실패, 범위 부족, 검사 순서를 확인했습니다. 실제 게이트 검증·세션 철회·CSRF 토큰 발급·운영 권한 정책·HTTP 라우트는 구현되지 않았습니다. [OWASP CSRF 지침](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)을 실제 세션 방식에 맞춰 적용해야 합니다.

12일차 공개 설정 HTTP 핸들러는 관리자 쓰기 경로와 독립적이며 Firestore 게시 포인터와 불변 릴리스만 서버에서 읽습니다. 공개 DTO 투영이 실패하면 오류로 거부하며 초안·감사 로그·운영자 필드를 응답하지 않습니다. 등록된 HTTPS 도메인에만 CORS 허용 헤더를 보내지만 CORS는 서버 간 조회를 막는 인증 수단이 아닙니다. 운영 배포 전에는 별도 서버 진입점, IAM 최소 권한, TLS/CDN 및 속도 제한을 연결해야 합니다.

## 5일차 배포 주체 경계

등록 CLI의 `--apply`는 HTTPS 전용 경로와 배포 환경의 별도 Bearer 자격 증명을 요구합니다. 직원 브라우저 쿠키를 사용하지 않으며 URL·로그에 토큰을 출력하지 않습니다. 서버 `registerSiteFromDeployment`는 검증기가 없거나 만료·대상 서비스가 다른 주체를 거부합니다. 실제 서명·발급자·허용 사이트 범위를 검증할 `DeploymentVerifier`와 HTTP 라우트는 **미구현**입니다. 로컬 Firestore 트랜잭션 테스트는 가상 배포 주체를 주입한 검증이며 운영 인증을 증명하지 않습니다. 서비스 계정은 서버에서만 사용하고 IAM 최소 권한과 키 관리가 필요합니다. [Firebase Admin SDK 설정](https://firebase.google.com/docs/admin/setup), [서버 SDK와 Rules 경계](https://firebase.google.com/docs/firestore/security/rules-conditions)를 참조하세요.

## 운영 전 필수 조건

- [ ] 사내 VPN, 접근 프록시 또는 기존 회사 인증 게이트웨이가 관리자 진입과 API를 보호
- [ ] 신뢰된 게이트만 API에 도달하고 클라이언트 신원 헤더를 제거·덮어쓰는지 확인
- [ ] 서버가 모든 쓰기·게시·롤백 요청의 운영자 신원, 권한, 사이트 범위를 검증
- [ ] CSRF, 세션 만료, 리플레이, rate limit, 감사 로그 정책 검증
- [ ] Firestore Rules로 익명 및 브라우저 직접 쓰기 거부; 에뮬레이터에서 부정 테스트
- [ ] 서비스 계정 키·토큰을 Vite 환경변수/공개 JSON/저장소에 포함하지 않음
- [ ] 등록 CLI는 배포 주체 자격 증명과 siteId 멱등성 검사 사용
- [ ] 배포 주체 토큰의 서명·발급자·대상·만료·사이트 범위와 API 직접 우회 차단 검증
- [ ] 모든 매체 ID와 이벤트명 서버 검증; 임의 JS/HTML 저장·실행 금지
- [ ] 게시 JSON에 비밀값, 실제 광고주 PII, 내부 직원 정보가 없는지 검사
- [ ] 기존 하드코딩/GTM 내부 태그와 중복 실행 점검
- [ ] 기존 next/script 공통 태그·완료 페이지 전환·mleverage.client.js와 신규 SDK의 실행 주체를 매체/이벤트별로 한 곳에 배정
- [ ] 기존 완료 페이지와 신규 SDK의 sessionStorage 키가 서로 달라도 중복 전송되지 않도록 단일 실행 주체로 제어
- [ ] 동의 관리, CSP, 개인정보처리방침, 플랫폼별 정책 검토
- [ ] CDN 캐시/롤백 실패 시 이전 게시본 유지와 감사 가능성 확인
- [ ] SDK 장애가 문의 접수 흐름을 막지 않는지 검증

포트폴리오 공개에는 가상 업체·도메인·ID만 사용합니다. 운영 데이터 덤프나 실제 광고 매체 식별자를 커밋하지 않습니다. 현재 SDK의 DOM 검사만으로 기존 인라인 태그를 완전히 판별할 수 없으므로 실제 사이트별 태그 인벤토리가 필요합니다.

**참고 코드 확인:** 사용자 제공 기존 랜딩 사례에는 /complete?token 및 sessionStorage 중복 방지가 있습니다. **실제 저장소 코드 확인:** 신규 SDK에도 별도의 sessionStorage 시도 키가 있습니다. 두 키의 공존은 매체별 단일 전송을 보장하지 않습니다. **운영 환경 검증 필요:** 실제 토큰의 생성·검증·만료·URL 노출 정책과 광고 플랫폼 수신 결과를 확인합니다. 토큰을 접수 성공의 서버 증명이나 공개 문서의 예시 값으로 사용하지 않습니다.

## 1일차 공개 이력 점검

현재 파일의 ID 형태 값은 데모용이지만 초기 커밋 27c5c8b의 관리자 파일에는 이전 업체 식별자 형태의 값이 남아 있습니다. 비공개 저장소를 포트폴리오용으로 공개하기 전에는 전체 Git 이력을 검사하고, 가상 데이터만 있는 깨끗한 이력 또는 별도 저장소를 사용해야 합니다. 커밋 메시지만 재작성했으며 해당 파일 내용은 변경하지 않았습니다.
