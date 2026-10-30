# 2일차 — 모노레포 환경 구성

이 문서는 2일차 작업 계획과 실제 검증 결과를 함께 기록합니다. 실행하지 않은 기능은 완료로 표시하지 않습니다.

## 개발 목표

관리자·core·SDK·서버·등록 CLI를 분리 가능한 워크스페이스로 정리한다.

## 구현 기능

- npm workspaces
- 독립 TypeScript 검사
- 데모 실행 명령
- 등록 CLI의 워크스페이스 경계. 실제 CLI 명령은 후속 작업

## 수정 또는 생성할 파일

- package.json
- apps/admin/package.json
- packages/tracking-core/package.json
- packages/tracking-sdk/package.json
- packages/landing-register/package.json, tsconfig.json, src/index.ts
- packages/landing-register/README.md
- README.md, package-lock.json

## 구체적인 작업 순서

1. 기존 폴더와 패키지별 소스 보존
2. 등록 CLI 패키지를 npm workspaces에 포함하고 타입 검사 경계 추가
3. SDK → core 의존 방향과 각 패키지의 구현 상태를 README에 기록
4. 의존성 잠금 파일 동기화 후 워크스페이스 목록·타입 검사·빌드·테스트 실행

## 테스트 방법

- npm install
- npm ls --workspaces --depth=0
- npm run typecheck
- npm run build
- npm test

## 완료 체크리스트

- [x] 다섯 워크스페이스의 경계와 실행 명령이 README에 기록됨
- [x] 등록 CLI가 워크스페이스에 포함되고 독립 타입 검사를 실행함
- [x] 변경 내용과 테스트 결과를 이 문서에 기록

## 다음 일차 작업과의 연관성

3일차 데이터 계약과 Rules 설계의 기준이 된다.

## 작업 메모

- 구현 파일: 루트 package.json, package-lock.json, packages/landing-register/package.json·tsconfig.json·src/index.ts·README.md, README.md, 이 문서
- 테스트 결과: Node.js 22.14.0·npm 11.12.1에서 `npm install --offline` 성공, `npm ls --workspaces --depth=0`에 5개 패키지 표시, `npm run typecheck` 5개 워크스페이스 통과, `npm run build` 관리자 Vite 빌드 통과, `npm test` 3개 통과, `git diff --check` 통과. 첫 설치 시 제한된 실행 환경에서 워크스페이스 링크 생성이 `EPERM`으로 막혀 허용된 권한으로 재실행했다.
- 남은 이슈: 등록 CLI 실행 파일, 인증된 등록 API, 서버 실행 환경, SDK 배포 번들은 후속 일차에 구현·검증해야 함. 현재 `npm run build`는 관리자 앱만 빌드함.
