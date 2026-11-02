# 9일차 — GTM·Google Ads 어댑터

2026-11-02 작업 기록입니다. 실제 랜딩과 광고 플랫폼 수신 결과는 별도 검증으로 남깁니다.

## 개발 목표

공통 로더와 전환 호출을 공식 태그 동작에 맞춰 구현한다.

## 구현 기능

- GTM 컨테이너
- Ads AW/gtag
- dataLayer 전역 충돌 방지

## 수정 또는 생성할 파일

- packages/tracking-sdk/src/adapters/
- packages/tracking-sdk/src/index.ts
- packages/tracking-sdk/tsconfig.json
- tests/google-adapters.test.mjs
- docs/03-sdk-spec.md

## 구체적인 작업 순서

1. 기존 태그 조사
2. 로더 중복 방지
3. 전환 호출
4. 샘플 랜딩 검증

## 테스트 방법

- 모의 DOM에서 GTM 단독·Ads 단독·동시 설치, 기존 스크립트·전역 객체 재사용 검사
- SDK가 같은 eventId의 전환을 다시 호출하지 않는지 확인
- 실제 샘플 랜딩·GTM 컨테이너·Tag Assistant·광고 플랫폼 수신 확인은 미수행

## 완료 체크리스트

- [x] 모의 DOM에서 dataLayer·gtag를 덮어쓰지 않고 직접 설치 스크립트 중복 삽입과 같은 eventId 전환 중복 시도를 방지
- [x] 변경 내용과 테스트 결과를 이 문서에 기록
- [ ] 실제 샘플 랜딩과 Tag Assistant에서 공통·전환 동작 확인

## 다음 일차 작업과의 연관성

10일차 Naver 어댑터와 동일 인터페이스를 사용한다.

## 작업 메모

- 구현 파일: `packages/tracking-sdk/src/adapters/google.ts`, `packages/tracking-sdk/src/index.ts`, `packages/tracking-sdk/tsconfig.json`, `tests/google-adapters.test.mjs`
- 기존 태그 조사: 공식 [GTM dataLayer](https://developers.google.com/tag-platform/tag-manager/datalayer), [Google tag 설치](https://developers.google.com/tag-platform/gtagjs), [Google Ads 전환 이벤트](https://developers.google.com/tag-platform/devguides/conversions) 예시를 확인했다. 기존 운영 랜딩의 원본 코드와 GTM 컨테이너는 이 저장소에 없어 직접 대조하지 못했다.
- 구현 내용: GTM은 기본 dataLayer 배열을 보존하고 컨테이너 스크립트·초기 이벤트를 삽입한다. 전환은 설정된 dataLayer 이벤트명을 push한다. Google Ads는 기존 gtag를 덮어쓰지 않고 AW 목적지를 구성하며 `conversion` 이벤트에 `send_to`를 전달한다. 기존 동일 스크립트는 재삽입하지 않고 다른 Google tag 스크립트는 재사용한다. 두 어댑터는 SDK의 `adapters` 옵션에 명시적으로 주입해야만 실행된다.
- 테스트 결과: `npm test` 26개 통과(9일차 모의 DOM·SDK 통합 4개 포함), `npm run typecheck` 및 `npm run build` 통과. GTM 단독·Ads 단독·동시 사용, 기존 스크립트, 잘못된 전역 객체, 동일 eventId 중복 시도를 검사했다.
- 남은 이슈: 실제 랜딩/컨테이너에서 동일 Ads 전환이 GTM 내부에 있는지 확인해야 한다. 기존 완료 페이지 호출과 신규 SDK는 서로 다른 중복 키를 사용하므로 단일 실행 주체 이전이 필요하다. 외부 스크립트 네트워크 로드·Tag Assistant·광고 플랫폼 수신은 검증하지 못했다. GTM noscript 경로와 개인정보 동의 연동도 실제 랜딩에서 검토해야 한다.
