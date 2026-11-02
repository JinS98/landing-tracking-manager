# 10일차 — Naver WCS 어댑터

공식 `wcs.trans` 가이드를 대조하고 SDK의 선택적 Naver 어댑터를 구현했습니다. 실제 랜딩과 네이버 진단 환경에서의 수신 검증은 남아 있습니다.

## 개발 목표

유입 도메인과 전환 유형을 사용한 WCS 실행을 검증한다.

## 구현 기능

- WA ID
- inflowDomain
- lead 등 전환 유형

## 수정 또는 생성할 파일

- packages/tracking-sdk/src/adapters/
- docs/03-sdk-spec.md

## 구체적인 작업 순서

1. 공식 스니펫 검토
2. 공통 초기화
3. 전환 함수 분리
4. 도메인별 적용 확인

## 테스트 방법

- 유입 도메인 불일치
- 중복 로드
- 완료 페이지 재방문

## 완료 체크리스트

- [ ] 공식 진단 환경에서 공통/전환 동작 확인
- [x] 변경 내용과 테스트 결과를 이 문서에 기록

## 다음 일차 작업과의 연관성

11일차 나머지 매체도 같은 중복 방지 규약을 따른다.

## 작업 메모

- 구현 파일: `packages/tracking-sdk/src/adapters/naver.ts`, `packages/tracking-sdk/src/index.ts`, `packages/tracking-core/src/index.ts`, `tests/naver-adapter.test.mjs`.
- 공식 가이드 대조: [`wcs.trans` 설치 가이드](https://naver.github.io/conversion-tracking/pages/01_script_guide_wcstrans/)의 `wcslog.js` → WA ID → `wcs.inflow` → `wcs_do` → `wcs.trans` 순서를 반영. `inflowDomain`은 쿠키 도메인이고 이 SDK에서는 현재 호스트와의 일치 여부도 확인한다. 다른 호스트에서는 스크립트를 삽입하지 않는다.
- 테스트 결과: `npm test` 31개 통과(이 중 Naver 5개), `npm run typecheck`와 `npm run build` 통과. 모의 DOM에서 도메인 불일치, 동일 설정 중복 로드, 기존 스크립트 재사용, WA ID 충돌, 구형 `_nasa.cnv` 감지, 완료 페이지 재방문 중복 방지를 확인했다.
- 남은 이슈: 실제 WA ID와 랜딩 주소가 없어 [네이버 전환 스크립트 어시스턴트](https://naver.github.io/conversion-tracking/pages/06_script_assistant_guide/) 및 광고 플랫폼 수신을 확인하지 못했다. 기존 랜딩의 `wcs.cnv`·GTM·하드코딩 실행 주체를 조사한 뒤 켜야 한다. 공식 가이드는 신형 전환 테스트가 구형 전환 필터링에 영향을 줄 수 있다고 경고하므로 운영 WA ID의 실제 `lead` 전송 테스트는 이 저장소에서 수행하지 않았다. 경로 단위 쿠키 도메인과 SPA 라우트별 PV는 현재 지원하지 않는다. `purchase`는 금액 필드가 없어 게시 설정에서 거부한다.
