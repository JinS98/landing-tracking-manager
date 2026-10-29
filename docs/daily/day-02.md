# 2일차 — 모노레포 환경 구성

이 문서는 작업 계획입니다. 체크리스트는 해당 일차의 실제 검증 후 표시합니다.

## 개발 목표

관리자·core·SDK·서버·등록 CLI를 분리 가능한 워크스페이스로 정리한다.

## 구현 기능

- npm workspaces
- 독립 TypeScript 검사
- 데모 실행 명령

## 수정 또는 생성할 파일

- package.json
- apps/admin/package.json
- packages/tracking-core/package.json
- packages/tracking-sdk/package.json

## 구체적인 작업 순서

1. 기존 폴더 보존
2. 패키지 의존 방향 정의
3. 타입 검사·빌드 스크립트 실행

## 테스트 방법

- npm install
- npm run typecheck
- npm run build

## 완료 체크리스트

- [ ] 각 패키지 경계와 실행 명령이 README에 기록됨
- [ ] 변경 내용과 테스트 결과를 이 문서에 기록

## 다음 일차 작업과의 연관성

3일차 데이터 계약과 Rules 설계의 기준이 된다.

## 작업 메모

- 구현 파일:
- 테스트 결과:
- 남은 이슈:
