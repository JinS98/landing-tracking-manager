# 4일차 — 사내 접근 제어 및 API 보호 설계

이 문서는 4일차 구현과 모의 환경 검증 결과를 기록합니다. 회사 게이트웨이 연결과 운영 API 배포는 포함하지 않습니다.

## 개발 목표

Firebase Auth 로그인 UI 대신 사내 접근 게이트와 서버 검증 계약을 정한다.

## 구현 기능

- VPN/프록시/기존 게이트웨이 선택
- 운영자 컨텍스트
- CSRF·세션·권한 검사
- 미연결 시 접근 거부와 관리자 읽기·쓰기 경계

## 수정 또는 생성할 파일

- apps/admin/src/lib/adminGateway.ts
- functions/src/access.ts, functions/src/README.md
- tests/access.test.mjs, package.json
- docs/01-architecture.md
- docs/04-api-spec.md
- docs/05-security.md
- docs/06-test-plan.md, README.md

## 구체적인 작업 순서

1. 기존 회사 관리자 인증 게이트웨이를 향후 직원 신원의 기준으로 정하고 VPN·접근 프록시의 역할 분리
2. 브라우저 신원 헤더 제거, 게이트 검증, 세션 만료·CSRF·행동/사이트 범위 검사 순서 정의
3. `requireAdminAccess`를 서버 전용 조합 함수로 구현하고 검증기·인가자 미설정 시 거부
4. 관리자 읽기·쓰기 경로별 행동과 오류 코드를 문서화하고 HTTP 라우트는 미배포 상태 유지
5. 모의 검증기·CSRF 검사기·인가자로 부정/정상 흐름 테스트

## 테스트 방법

- `npm test`: 위조된 신원 헤더, 만료·불완전 세션, CSRF 거부, 사이트 범위 부족, 검사 순서와 정상 읽기·쓰기
- `npm run typecheck`, `npm run build`, `git diff --check`

## 완료 체크리스트

- [x] 로그인 UI 없이 운영 쓰기·비공개 읽기 보호 조건과 신뢰 경계 문서화
- [x] 미설정 게이트를 거부하는 서버 전용 검사 조합 함수와 모의 테스트 추가
- [x] 변경 내용과 테스트 결과를 이 문서에 기록

## 다음 일차 작업과의 연관성

5일차 CLI에는 직원 세션과 다른 배포 주체 인증을 적용한다.

## 작업 메모

- 구현 파일: apps/admin/src/lib/adminGateway.ts, functions/src/access.ts·README.md, tests/access.test.mjs, package.json, docs/01-architecture.md·04-api-spec.md·05-security.md·06-test-plan.md, README.md, 이 문서
- 테스트 결과: `npm test`의 접근 계약 모의 테스트 7개와 기존 MVP 테스트 3개 통과. `npm run typecheck` 5개 워크스페이스 통과, `npm run build` 관리자 빌드 통과, `git diff --check` 통과.
- 남은 이슈: 실제 게이트 프로토콜·서명/프록시 검증, 세션 철회·CSRF 토큰, 업체/사이트 권한 정책, HTTP 라우트, API 부정 테스트는 미구현. 회사 환경 확인 전에는 운영 쓰기 API를 배포하지 않음.
