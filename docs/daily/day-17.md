# 17일차 — 초안·게시·롤백

이 문서는 17일차 구현·검증 기록입니다. 운영 관리자 HTTP와 CDN은 아직 연결되지 않았습니다.

## 개발 목표

초안과 게시본을 분리하고 이전 버전을 새 버전으로 복원한다.

## 구현 기능

- 미리보기
- 데모 릴리스
- 운영 트랜잭션·CDN 설계

## 수정 또는 생성할 파일

- apps/admin/src/lib/demoWorkspace.ts
- apps/admin/src/App.tsx
- functions/src/
- docs/04-api-spec.md

## 구체적인 작업 순서

1. 데모 흐름 검증
2. expectedVersion 서버 계약
3. 불변 릴리스
4. 캐시 무효화 설계

## 테스트 방법

- 변경 없는 게시
- 버전 충돌
- 롤백 후 새 릴리스 번호
- 신규 게시 설정과 기존 랜딩 코드·GTM 컨테이너를 함께 되돌릴 때 실행 주체가 하나로 유지되는지 확인

## 완료 체크리스트

- [x] 데모와 운영 게시 상태를 명확히 분리
- [x] 변경 내용과 테스트 결과를 이 문서에 기록

## 다음 일차 작업과의 연관성

18일차 감사 로그와 설치 진단에 연결한다.

## 작업 메모

- 구현 파일: `apps/admin/src/lib/demoWorkspace.ts`, `apps/admin/src/App.tsx`, `functions/src/releaseWorkflow.ts`, `tests/mvp.test.mjs`, `tests/release-firestore.test.mjs`, `tests/admin-ui.test.mjs`.
- 데모: 초안 버전과 마지막 게시본의 내용 차이를 확인해 변경 없는 게시를 거부한다. 롤백은 대상 내용을 새 릴리스 번호로 복사하고 이전 릴리스를 보존한다. 화면에는 공통·전환 설정의 추가·수정·제거 요약과 양쪽 JSON 미리보기를 표시한다. 게시·롤백은 브라우저 메모리에만 남는다.
- 서버 전용 트랜잭션: `saveAdminDraft`는 `expectedVersion=draftVersion`, `publishAdminDraft`는 현재 초안 버전을 비교한다. `rollbackAdminRelease`는 `expectedPublishedVersion`과 공개 포인터를 비교한다. 불일치·내용 변화 없음은 409로 거부한다. 릴리스 생성, 포인터·초안 갱신, 감사 로그는 Firestore 트랜잭션 한 번으로 처리하며 기존 릴리스는 수정하지 않는다. 모든 함수는 `requireAdminAccess`를 통과해야 호출된다.
- 공개 조회와 캐시: 공개 핸들러는 게시 포인터가 가리키는 불변 릴리스를 읽고 ETag와 0초 TTL 재검증을 사용한다. Firestore 트랜잭션 커밋 후 원본 조회는 새 버전을 반환한다. CDN·정적 JSON 배포는 없으며 양수 TTL이나 별도 CDN을 도입할 때는 버전별 아티팩트 선배포, 포인터 전환, 캐시 무효화 결과와 실패 상태를 따로 관리해야 한다.
- 테스트 결과: `npm test` 62건, `npm run typecheck`, `npm run build`, 로컬 Edge `npm run test:ui` 2건 통과. `npm run test:release`는 로컬 Firestore 에뮬레이터에서 초안·게시·롤백, 변경 없음, 409 충돌, 동시 쓰기, 접근 검사 누락, 공개 리더의 새 포인터 조회를 3건으로 확인했다.
- 남은 이슈: 실제 회사 인증·CSRF·인가 구현과 관리자 HTTP 라우트, Firebase 운영 배포, CDN 게시·무효화는 없다. 실제 랜딩 코드·GTM 컨테이너와 게시/롤백을 함께 적용했을 때 단일 전환 실행 주체가 유지되는지는 운영 통합 시험이 필요하다.
