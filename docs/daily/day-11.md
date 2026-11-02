# 11일차 — 당근·Meta·TikTok 어댑터

당근·Meta·TikTok 어댑터를 선택적 주입 모듈로 구현하고 모의 DOM에서 검증했습니다. 실제 광고 플랫폼 수신 검증은 남아 있습니다.

## 개발 목표

세 매체의 공식 픽셀 로더와 지원 전환 이벤트를 분리 구현한다.

## 구현 기능

- 당근/Meta/TikTok ID와 이벤트명 검증
- 기존 전역 객체 감지

## 수정 또는 생성할 파일

- packages/tracking-sdk/src/adapters/
- docs/03-sdk-spec.md

## 구체적인 작업 순서

1. 공식 API 확인
2. 매체별 로더 구현
3. 전환 매핑
4. 동의/중복 검사

## 테스트 방법

- 기존 fbq/ttq
- 중복 삽입
- 지원하지 않는 이벤트명

## 완료 체크리스트

- [x] 6개 매체 어댑터가 모두 모의 DOM에서 테스트된 상태
- [x] 변경 내용과 테스트 결과를 이 문서에 기록

## 다음 일차 작업과의 연관성

12일차 공개 설정이 이 어댑터들에 데이터만 전달한다.

## 작업 메모

- 구현 파일: `packages/tracking-sdk/src/adapters/social.ts`, `packages/tracking-sdk/src/index.ts`, `packages/tracking-core/src/index.ts`, `tests/social-adapters.test.mjs`, 관리자 설정 입력 안내.
- 공식 자료: 당근 [공통 스크립트](https://bizschool.daangn.com/19128c3a-9f8f-8154-b217-d03d2f6ddf5c)와 [신청 완료 이벤트](https://bizschool.daangn.com/19128c3a-9f8f-8126-bcc3-e287ef8ab51a), TikTok [픽셀 개발자 가이드](https://ads.tiktok.com/gateway/docs/index?doc_id=1701890973258754)를 대조했다. `consultation_complete`는 당근 `SubmitApplication`, Meta `Lead`, TikTok `SubmitForm`만 허용한다.
- 테스트 결과: `npm test` 39개 통과(당근·Meta·TikTok 신규 8개), `npm run typecheck`와 `npm run build` 통과. 픽셀 ID·지원 이벤트 검증, 기존 큐 재사용, 중복 삽입 방지, 알 수 없는 전역 객체와 다른 ID의 큐 거부, 동의 거부, 완료 페이지 재방문 중복 방지를 확인했다.
- 남은 이슈: 실제 랜딩·픽셀 헬퍼·플랫폼 이벤트 수신은 검증하지 못했다. Meta 공식 개발자 문서는 이 환경에서 로그인/요청 제한으로 본문을 열지 못해 이벤트 관리자에서 재확인이 필요하다. 기존 하드코딩 픽셀과 GTM 내부 태그의 실행 주체도 확인해야 한다. SPA 라우트별 페이지뷰는 미구현이다.
