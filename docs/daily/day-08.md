# 8일차 — 스크립트 설정 타입 및 검증

2026-11-02 작업 기록입니다. 운영 서버 게시와 매체 어댑터 검증은 별도 단계입니다.

## 개발 목표

매체별 공통 태그와 전환 이벤트 입력 계약을 정의한다.

## 구현 기능

- 6개 provider 타입
- GTM/AW/Naver 필수 필드
- 임의 JS 금지

## 수정 또는 생성할 파일

- apps/admin/src/types/tracking.ts
- apps/admin/src/lib/demoWorkspace.ts
- apps/admin/src/App.tsx
- apps/admin/package.json, package-lock.json
- packages/tracking-core/src/index.ts
- packages/tracking-core/README.md
- tests/tracking-config.test.mjs, tests/mvp.test.mjs
- docs/02-database.md

## 구체적인 작업 순서

1. 기존 타입 확장
2. 입력 검증
3. 공개 설정 투영 분리
4. 오류 메시지 작성

## 테스트 방법

- 잘못된 AW/send_to
- Naver 유입 도메인 누락
- 임의 코드 필드 거부

## 완료 체크리스트

- [x] 초안 저장·공개 DTO 투영·SDK 공개 설정 파싱에 같은 매체별 규칙 적용
- [x] 변경 내용과 테스트 결과를 이 문서에 기록

## 다음 일차 작업과의 연관성

9~11일차 어댑터가 검증된 데이터만 받게 한다.

## 작업 메모

- 구현 파일: `packages/tracking-core/src/index.ts`, `apps/admin/src/types/tracking.ts`, `apps/admin/src/lib/demoWorkspace.ts`, `apps/admin/src/App.tsx`, `tests/tracking-config.test.mjs`, `tests/mvp.test.mjs`
- 변경 내용: 6개 provider 타입을 tracking-core에서 공유한다. `parseDraftConfig`는 초안 저장 전에 필수 필드·형식·매체 관계·중복 ID를 검사한다. `projectPublishedConfig`는 허용된 공개 필드만 새 DTO로 만들고, `parsePublishedConfig`는 같은 규칙으로 SDK 입력을 검사한다. 알 수 없는 필드와 코드/HTML 필드는 거부한다. 데모 게시·롤백 릴리스에는 초안과 별도 `publicConfig`를 남기고 화면에서 공개 DTO를 확인한다. 잘못된 편집 입력은 화면 오류로 표시한다.
- 테스트 결과: `npm test` 22개 통과. 잘못된 AW ID·`send_to`, AW ID 불일치, Naver 유입 도메인 누락·오류, 임의 코드 필드, 6개 매체의 초안·공개 DTO 일치, 데모 릴리스 투영을 검사했다. `npm run typecheck` 및 `npm run build` 통과.
- 남은 이슈: 실제 서버의 초안 저장·게시 API, CDN 배포, 6개 매체 어댑터와 운영 랜딩 수신 검증은 아직 구현되지 않았다. 이 테스트는 광고 플랫폼 전송 성공을 확인하지 않는다.
