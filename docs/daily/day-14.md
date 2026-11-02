# 14일차 — 전환 이벤트 감지

이 문서는 14일차 구현 및 검증 기록입니다. 실제 랜딩·문의 서버 연동은 별도로 확인해야 합니다.

## 개발 목표

실제 문의 성공 이벤트와 /complete 호환 전환 흐름을 정한다.

## 구현 기능

- track API
- Next.js History 이동
- token 기반 단기 감지
- 참고 코드 확인: 기존 랜딩의 /complete?token 이동과 완료 페이지 Google Ads·Meta 호출 사례(원본 미열람)

## 수정 또는 생성할 파일

- packages/tracking-sdk/src/index.ts
- docs/03-sdk-spec.md

## 구체적인 작업 순서

1. 성공 콜백 계약 작성
2. /complete?token 감지
3. SPA 이동 처리
4. 이벤트 ID 전달

## 테스트 방법

- 초기 로드/pushState/replaceState/popstate
- token 없는 방문
- 실제 저장소 코드 확인: 신규 SDK의 /complete 감지 구현
- 운영 환경 검증 필요: 실제 문의 성공 응답과 완료 페이지 호출 시점

## 완료 체크리스트

- [x] 실제 성공 여부와 단순 페이지 방문의 차이를 문서화
- [x] 변경 내용과 테스트 결과를 이 문서에 기록

## 다음 일차 작업과의 연관성

15일차 중복 시도와 오류 처리를 검증한다.

## 작업 메모

- 구현 파일: `packages/tracking-sdk/src/index.ts`, `tests/sdk-conversion.test.mjs`, `docs/03-sdk-spec.md`
- 성공 콜백 계약: 문의 서버가 접수를 확정하고 고유 `eventId`를 반환한 뒤 `sdk.track('consultation_complete', { eventId })`를 호출한다. SDK 초기화가 진행 중이면 `track`은 완료를 기다린다. 단순 버튼 클릭·폼 제출 시도·완료 페이지 방문은 성공 증거가 아니다.
- 호환 경로 계약: SDK는 정확한 `/complete` 또는 `/complete/`의 단일 유효 `token`만 읽는다. 15일차 요구 정정에 따라 랜딩이 문의 성공 후 발급한 랜덤 token으로 이동하면 그 token을 전환 식별자로 사용한다. `verifyCompletionToken`은 선택적 추가 검증이며, 제공한 경우 거부·오류·경로 변경 때 전환하지 않는다. 성공 콜백과 경로 검증은 같은 접수에 같은 `eventId`를 사용해야 중복 시도를 막을 수 있다.
- 경로 감지: 초기 로드, `pushState`, `replaceState`, `popstate`를 모의 브라우저에서 검증했다. [MDN popstate 문서](https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event)에 따라 이력 API 직접 호출도 감지하도록 두 메서드를 감싼다. SDK `destroy()` 시 원래 메서드를 복구한다.
- 테스트 결과: 신규 전환 테스트 5건 통과. 전체 `npm test` 53건 통과, `npm run typecheck` 및 `npm run build` 통과.
- 남은 이슈: 이 저장소에는 실제 랜딩과 문의 서버가 없다. 랜덤 token의 발급·재사용 정책과 필요 시 `verifyCompletionToken` 서버 조회, 실제 Next.js 이동, 광고 플랫폼 수신, 기존 완료 페이지와 단일 실행 주체 여부는 운영 연동 시 검증해야 한다.
