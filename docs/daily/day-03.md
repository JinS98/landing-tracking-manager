# 3일차 — Firestore 및 보안 규칙

이 문서는 3일차 작업과 로컬 검증 결과를 기록합니다. 운영 Firestore 배포는 포함하지 않습니다.

## 개발 목표

기존 6개 컬렉션 모델과 서버 전용 쓰기 정책을 설계한다.

## 구현 기능

- companies/sites/trackingConfigs/trackingReleases/auditLogs/importJobs
- 버전·siteId 고유성
- 브라우저 직접 접근 거부 Rules의 로컬 부정 테스트

## 수정 또는 생성할 파일

- docs/02-database.md
- docs/05-security.md
- firestore.rules
- firestore.indexes.json
- firebase.json
- tests/firestore-rules.test.mjs
- package.json, README.md, docs/06-test-plan.md
- functions/src/README.md

## 구체적인 작업 순서

1. 여섯 컬렉션의 문서 ID, 참조 관계, 서버 트랜잭션 계약 정의
2. 초안·내부 릴리스와 공개 게시 JSON의 필드 분리
3. 결정적 릴리스 ID와 사이트 등록 멱등성, 조회별 복합 인덱스 계획
4. 모든 클라이언트 접근을 거부하는 Rules를 `firebase.json`으로 에뮬레이터에 연결
5. 익명 REST 조회·생성·수정·삭제 거부 테스트 실행 및 결과 기록

## 테스트 방법

- Firebase CLI와 Java 21 설치 후 `npm run test:rules`
- `npm run typecheck`, `npm run build`, `npm test`
- `git diff --check`

## 완료 체크리스트

- [x] 여섯 컬렉션의 문서 ID·참조·공개 범위·서버 트랜잭션 계약 정리
- [x] 조회별 인덱스 초안과 모든 클라이언트 접근 거부 Rules 유지
- [x] 로컬 에뮬레이터의 익명 접근 거부 테스트 7개 통과
- [x] 변경 내용과 테스트 결과를 이 문서에 기록

## 다음 일차 작업과의 연관성

4일차 게이트의 권한 검사와 5일차 등록 트랜잭션을 구체화한다.

## 작업 메모

- 구현 파일: docs/02-database.md, docs/05-security.md, docs/06-test-plan.md, firestore.rules, firestore.indexes.json, firebase.json, tests/firestore-rules.test.mjs, package.json, README.md, functions/src/README.md, 이 문서
- 테스트 결과: Firebase CLI 15.34.1·Java 21의 `demo-landing-tracking-manager` 에뮬레이터에서 `npm run test:rules` 7개 통과. `npm run typecheck` 5개 워크스페이스 통과, `npm run build` 관리자 빌드 통과, `npm test` 3개 통과, JSON 형식 확인 및 `git diff --check` 통과.
- 남은 이슈: 실제 Firestore 프로젝트 배포와 인덱스 빌드, 인증된 브라우저 접근 거부, 서버 IAM·게이트·트랜잭션·등록 API는 미구현/미검증. 복합 인덱스는 siteId·릴리스 버전의 고유성을 보장하지 않으므로 서버 트랜잭션 구현이 필요함.
