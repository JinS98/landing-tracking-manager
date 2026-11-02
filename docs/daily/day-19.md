# 19일차 — 기존 랜딩 연동 테스트

이 문서는 19일차 로컬 통합 작업 기록입니다. 사용자는 실제 랜딩 원본을 추후 공유하기로 했으며, 현재 저장소와 작업공간에는 Next.js 랜딩·문의 서버·GTM 컨테이너 원본이 없습니다. 아래 브라우저 시험은 가상 랜딩 픽스처로 수행했습니다.

## 개발 목표

실제 랜딩에서 기존 태그와 SDK의 공존·교체를 검증한다.

## 구현 기능

- Next.js 이동
- 문의 성공
- 중복 태그 제거
- 동의·성능
- 기존 next/script·완료 페이지·GTM과 신규 SDK의 매체별 실행 주체 검증(문의·페이지뷰용 mleverage.client.js는 별도 확인)

## 수정 또는 생성할 파일

- packages/tracking-sdk/src/
- docs/03-sdk-spec.md
- docs/06-test-plan.md

## 구체적인 작업 순서

1. 테스트 사이트를 선정하고 제공된 참고 사례를 실제 랜딩 원본과 대조
2. app/layout.tsx·완료 페이지·mleverage.client.js·GTM 컨테이너의 태그 소유 경로 기록
3. 신규 SDK를 매체 어댑터 비활성 상태로 설치하고 설정·라우트 감지 검증
4. 매체별 기존 공통·전환 호출을 끄고 신규 어댑터를 켜는 단일 주체 이전
5. 성공/실패·재방문·동의 거부 및 코드/컨테이너/게시 설정의 묶음 롤백 검증

## 테스트 방법

- 브라우저·매체 진단 도구
- 장애·차단·3초 이내 이동
- GTM 내부 트리거, Naver WCS 호출 버전, 광고 플랫폼 실제 수신 결과 확인

## 완료 체크리스트

- [ ] 중복 없는 전환과 문의 폼 정상 동작 확인
- [x] 참고 코드 확인·실제 저장소 코드 확인·운영 환경 검증 필요 항목의 증거와 결과 구분
- [x] 변경 내용과 테스트 결과를 이 문서에 기록

## 다음 일차 작업과의 연관성

20일차 운영 게이트 통과 여부를 결정한다.

## 작업 메모

- 구현 파일: `packages/tracking-sdk/vite.config.ts`, `packages/tracking-sdk/src/index.ts`, `tests/fixtures/landing.html`, `tests/fixtures/landing.ts`, `tests/landing-integration.test.mjs`, `package.json`.
- 브라우저 번들: `npm run build:sdk`로 IIFE 파일 `packages/tracking-sdk/dist/landing-tracking-sdk.iife.js`를 생성한다. 20.45KB(압축 6.29KB)이며 `LandingTrackingSdk` 전역에서 SDK와 선택적 어댑터를 제공한다. `dist`는 빌드 결과물이며 저장소에 커밋하거나 운영에 배포하지 않았다.
- 로컬 통합: 가상 랜딩의 문의 성공 버튼만 랜덤 token을 만들고 History API로 `/complete?token=...`에 이동한다. 실패 버튼은 이동·전환하지 않는다. 기존 문의·페이지뷰 역할은 별도 가상 계수기로 유지한다. 관찰 모드에서 신규 어댑터를 주입하지 않으면 광고 스크립트를 추가하지 않는다. 단일 SDK 주체 모드에서는 Google Ads 가상 설정으로 전환 호출 1회, 뒤로 가기·앞으로 가기·같은 탭 재방문 시 추가 호출 0회를 확인했다. 동의 거부에서는 태그와 전환 호출이 없고 문의 흐름은 계속된다.
- 중복·장애 증거: 기존 완료 페이지 전환 주체와 신규 SDK를 동시에 켠 가상 모드에서 로컬 전환 시도 2회를 확인했다. 따라서 사이트별 매체 실행 주체를 한 쪽으로 이전해야 한다. 외부 Google 스크립트를 브라우저에서 차단해도 완료 경로 이동은 3초 안에 끝났으나, `gtag` 큐 호출만으로 광고 플랫폼 수신을 증명할 수 없다. SDK 진단의 `adapter_setup`은 외부 스크립트 로드 성공 신호가 아니다.
- 검증 명령: `npm run test:landing` 6건, `npm test` 63건, `npm run typecheck`, `npm run build`가 통과했다. 태그 차단 시험에서는 실제 외부 스크립트 요청이 차단된 것도 확인했다.
- 참고 코드 확인: 기존 Next.js `app/layout.tsx`의 `next/script`, 완료 페이지 Google Ads·Meta 호출, `mleverage.client.js`의 문의·페이지뷰 역할은 사용자 제공 설명이다. 해당 원본을 이번 작업에서 열어 확인하지 않았다.
- 운영 환경 검증 필요: 실제 랜딩 원본의 문의 성공 조건·`/complete` 처리·동의 관리·기존 태그 목록, GTM 내부 트리거, Naver WCS 호출 버전, 매체 진단 도구와 광고 플랫폼 수신을 확인해야 한다. 기존 전환 코드 제거와 신규 SDK 활성화는 동일 사이트·매체별로 함께 검증해야 한다. 운영 관리자 설정 API와 공개 설정 URL도 아직 배포되지 않았다.
