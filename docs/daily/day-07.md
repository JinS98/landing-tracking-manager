# 7일차 — 엑셀 업로드

2026-11-02 작업 기록입니다. 운영 API와 브라우저 수동 검증은 별도 상태로 표시합니다.

## 개발 목표

업체·사이트 대량 등록 입력을 검증 가능한 importJobs 흐름으로 설계한다.

## 구현 기능

- 열 매핑
- 미리보기
- 중복 건너뛰기
- 오류 보고

## 수정 또는 생성할 파일

- apps/admin/src/ImportPage.tsx
- apps/admin/src/lib/demoImport.ts
- apps/admin/src/types/tracking.ts
- apps/admin/src/lib/demoData.ts
- apps/admin/src/App.tsx, styles/mvp.css
- tests/import.test.mjs
- docs/02-database.md, docs/04-api-spec.md, docs/00-overview.md, README.md

## 구체적인 작업 순서

1. 샘플 양식 정의
2. 서버 검증·미리보기 설계
3. importJobs 상태 기록
4. 결과 UI 연결

## 테스트 방법

- 기존 siteId의 동일 입력 건너뛰기 및 다른 업체·도메인 충돌
- 잘못된 도메인, 빈 셀, 다른 기존 업체명
- 파일 안의 siteId 중복, 같은 파일 재업로드, 다른 작업 ID로 재업로드
- 기존 초안 보존, 새 업체·사이트 추가

## 완료 체크리스트

- [x] 유효한 행만 등록하고 기존 설정을 보존하는 데모 일괄 등록을 자동 테스트로 확인
- [x] 변경 내용과 테스트 결과를 이 문서에 기록
- [ ] 실제 `.xlsx` 파일의 브라우저 선택·열 매핑·적용 동선 수동 확인
- [ ] 운영 서버의 인증·재검증·Firestore importJobs 연결

## 다음 일차 작업과의 연관성

8일차 설정 타입의 siteId 참조 무결성에 연결한다.

## 작업 메모

- 구현 파일: `apps/admin/src/ImportPage.tsx`, `apps/admin/src/lib/demoImport.ts`, `apps/admin/src/types/tracking.ts`, `apps/admin/src/lib/demoData.ts`, `apps/admin/src/App.tsx`, `apps/admin/src/styles/mvp.css`, `tests/import.test.mjs`
- 샘플 양식: 첫 시트 첫 행에 `companyId`, `companyName`, `siteId`, `domain`. 예시 데이터는 `sample-coffee`, `샘플 커피`, `coffee-spring`, `spring.coffee.example` 순서이며 모두 가상 값이다. 열 순서는 사용자가 매핑할 수 있다. ID와 도메인은 Excel에서 텍스트 셀로 입력한다.
- 데모 동작: `.xlsx` 첫 시트, 2MB·500행 제한. 파일을 브라우저에서 읽고 행마다 등록·건너뜀·오류를 표시한다. 같은 siteId·업체·도메인은 건너뛰고 충돌은 오류로 표시한다. 유효한 새 업체·사이트만 메모리에 추가하며 기존 초안은 보존한다. 파일 내용과 열 매핑의 digest를 작업 ID로 사용하고 메모리 `importJobs`에 결과 건수를 남긴다.
- 운영 설계: `docs/02-database.md`와 `docs/04-api-spec.md`에 관리자 인증, 서버 재검증, 작업 선점, 행별 트랜잭션, 결과 조회 계약을 기록했다. 운영 HTTP API와 Firestore importJobs 쓰기는 아직 없다.
- 테스트 결과: `npm test` 18개 통과(일괄 등록 3개 포함), `npm run typecheck` 및 `npm run build` 통과. 실제 `.xlsx` 브라우저 클릭 동선은 검증하지 못했다.
- 남은 이슈: 데모는 새로고침 시 초기화된다. 운영용 회사 생성 권한 정책과 서버의 파일 저장·재시도·오류 결과 보존 방식은 실제 관리자 게이트 연결 시 확정해야 한다.
