# 14일차 — 전환 이벤트 감지

이 문서는 작업 계획입니다. 체크리스트는 해당 일차의 실제 검증 후 표시합니다.

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

- [ ] 실제 성공 여부와 단순 페이지 방문의 차이를 문서화
- [ ] 변경 내용과 테스트 결과를 이 문서에 기록

## 다음 일차 작업과의 연관성

15일차 중복 시도와 오류 처리를 검증한다.

## 작업 메모

- 구현 파일:
- 테스트 결과:
- 남은 이슈:
