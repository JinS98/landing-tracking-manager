# 5일차 — 업체 자동 등록 CLI

이 문서는 5일차 구현과 로컬 검증 결과를 기록합니다. 실제 배포 주체 인증과 운영 API는 아직 연결되지 않았습니다.

## 개발 목표

배포 성공 후 siteId 기준으로 사이트를 멱등 등록하는 CLI를 설계·구현한다.

## 구현 기능

- CLI와 서버의 siteId·companyId·domain·environment 검증
- CLI dry run 및 별도 배포 토큰을 사용하는 HTTPS 요청 계약
- Firestore 트랜잭션의 중복/충돌 처리와 기존 설정 보존
- 검증기 미연결 시 등록 요청 거부

## 수정 또는 생성할 파일

- packages/landing-register/src/
- packages/landing-register/package.json, tsconfig.json, README.md
- functions/src/
- functions/package.json
- tests/registration-cli.test.mjs, tests/registration-firestore.test.mjs
- package.json, package-lock.json, README.md
- docs/04-api-spec.md
- docs/02-database.md, docs/05-security.md, docs/06-test-plan.md

## 구체적인 작업 순서

1. CLI 입력 계약과 Node.js 22.14+ 실행 명령 작성; 기본은 dry run
2. `--apply`에 HTTPS·배포 토큰·전용 경로를 요구하고 5xx/네트워크 오류만 최대 한 번 재시도
3. 직원 세션과 분리된 `DeploymentVerifier` 인터페이스 및 미설정 거부 경계 정의
4. Firestore Admin SDK 트랜잭션으로 업체 확인, 사이트·빈 초안·감사 로그 원자적 생성
5. 동일 siteId 재시도와 다른 업체·도메인·환경 충돌 처리 후 에뮬레이터 검증

## 테스트 방법

- `npm test`: CLI 입력, HTTPS·토큰 요구, HTTP 응답·재시도 모의 테스트
- `npm run test:registration`: 로컬 `demo-` Firestore 에뮬레이터에서 동일 siteId·도메인 충돌·동시 요청·초안 보존·검증기 미설정 검사
- `npm run typecheck`, `npm run build`, CLI dry run, `git diff --check`

## 완료 체크리스트

- [x] 로컬 트랜잭션에서 동일 입력 재등록이 기존 설정을 덮어쓰지 않음
- [x] 동일 siteId에 다른 업체·도메인·환경을 지정한 충돌과 동시 요청을 에뮬레이터에서 검사
- [x] 배포 주체 검증기가 없으면 등록 진입 함수가 거부함
- [ ] 실제 배포 주체 토큰 검증기·인증 API·배포 성공 이벤트 연결
- [x] 변경 내용과 테스트 결과를 이 문서에 기록

## 다음 일차 작업과의 연관성

6일차 목록은 현재 데모 사이트를 표시한다. 운영에서는 인증된 등록 API를 배포한 뒤 자동 등록 사이트를 조회하도록 연결해야 한다.

## 작업 메모

- 구현 파일: packages/landing-register/src/index.ts·cli.ts 및 패키지 설정·README, functions/src/registerSite.ts 및 패키지 설정·README, tests/registration-cli.test.mjs·registration-firestore.test.mjs, 루트 package.json·package-lock.json·README.md, docs/02-database.md·04-api-spec.md·05-security.md·06-test-plan.md, 이 문서
- 테스트 결과: Node.js 22.14.0에서 CLI dry run 성공, `npm test` 14개 통과(기존 10개+CLI 4개), `npm run test:registration`의 `demo-landing-tracking-manager` Firestore 에뮬레이터 테스트 6개 통과. `npm run typecheck` 5개 워크스페이스와 `npm run build` 관리자 빌드 통과, `git diff --check` 통과. 실제 HTTP 요청과 운영 Firebase는 실행하지 않음.
- 남은 이슈: 실제 `DeploymentVerifier` 서명·발급자·범위 확인, HTTP 핸들러, 회사 배포 파이프라인 연결, 운영 IAM/Rules 배포, `importJobs` 갱신은 미구현. 다른 siteId에 같은 도메인을 쓰는 정책도 운영 결정이 필요함. CLI `--apply`는 현재 서버에 연결할 대상이 없음.
