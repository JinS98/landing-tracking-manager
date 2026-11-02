# Tracking SDK 명세

## 현재 코드 범위

tracking-core는 초안과 공개 설정을 같은 매체별 규칙으로 검증하고, 데모 게시 시 공개 필드만 투영합니다. 허용되지 않은 필드가 있으면 읽기를 거부합니다. tracking-sdk는 게시 설정 로더, fetch 최대 2회, 타임아웃, 사이트별 태그 로딩 중복 방지, History API와 popstate 이동 감지, 랜덤 token 기반 /complete 전환 감지, sessionStorage 중복 시도 방지, track('consultation_complete', { eventId }) 인터페이스를 제공합니다. 6개 매체 어댑터는 **선택적 주입 모듈**입니다. 브라우저 번들 빌드는 가능하지만 실제 랜딩 수신 검증과 운영 배포는 아직 없습니다. 어댑터를 주입하지 않은 SDK는 광고 태그를 실행하지 않습니다.

**실제 저장소 코드 확인:** 위 범위는 현재 tracking-core·tracking-sdk 소스에서 확인했다. **참고 코드 확인:** 사용자 제공 기존 랜딩 사례에는 app/layout.tsx의 next/script 공통 태그, 문의·페이지뷰용 mleverage.client.js(사용자 확인), /complete?token 이동, 완료 페이지의 sessionStorage 중복 방지 및 Google Ads·Meta 전환 호출, Naver WCS 사용 경험이 포함된다. 원본 랜딩 코드를 이번 작업에서 열어 확인한 것은 아니다. **운영 환경 검증 필요:** 실제 설치 위치와 동작, GTM 내부 설정, Naver WCS 호출 버전, 플랫폼 수신 결과.

## 공개 설정과 로딩

SDK는 유효한 siteId로 공개 게시본만 요청합니다. 응답은 schemaVersion=1과 정확한 siteId를 가져야 하며, 검증 실패 시 태그를 실행하지 않습니다. 비밀키·임의 JS·초안은 응답에 넣지 않습니다. 네트워크·타임아웃·5xx는 최대 두 번, 4xx와 잘못된 게시 JSON은 한 번만 조회합니다. 제한 시간은 `fetch`와 본문 파싱 전체에 적용하며 기본 2.5초, 최대 10초입니다. `cache: 'no-cache'`로 브라우저의 저장된 응답을 재검증합니다. 12일차 공개 HTTP 핸들러는 ETag와 0초 TTL을 제공합니다. 서버 마운트·CDN 배포와 게시/롤백 시 캐시 purge는 아직 없습니다. 양수 TTL은 이 경로를 연결하고 운영 검증한 뒤에만 설정합니다.

같은 창에서 동일 siteId의 SDK 인스턴스를 중복 시작하면 첫 인스턴스가 설정 조회·공통 태그 로드·라우트 감지를 담당하고 두 번째 인스턴스는 전환 호출을 위임합니다. 동의가 없으면 태그를 로드하지 않고 다음 `start()`에서 다시 조회할 수 있습니다. 활성 공통 태그의 어댑터가 로드에 성공한 매체만 전환을 실행합니다. 네트워크·어댑터·진단 콜백 오류는 `start()` 바깥으로 전파되지 않습니다. 실제 폼 흐름은 SDK 초기화를 기다리지 않도록 랜딩에서 연결해야 합니다.

## 어댑터 계약

각 매체는 공통 태그 load와 전환 convert를 별도로 구현합니다. 설정에는 코드 대신 검증된 ID·이벤트명만 둡니다. 6개 매체 어댑터는 소스와 모의 DOM 테스트가 있습니다.

| 매체 | 공통 입력 | 전환 입력 | 검증 과제 |
|---|---|---|---|
| GTM | 컨테이너 ID | dataLayer 이벤트명 | 기존 컨테이너·noscript 처리 |
| Google Ads | AW ID | send_to | dataLayer/gtag 공유와 중복 |
| Naver WCS | WA ID, 쿠키 도메인 | 전환 유형(`purchase` 제외) | 기존 구형 태그와 플랫폼 수신 확인 |
| 당근 Pixel | 전환 추적 코드 ID | `SubmitApplication` | 사이트 등록 도메인·실제 수신 확인 |
| Meta Pixel | 숫자 Pixel ID | `Lead` | 기존 fbq·GTM 소유권 확인 |
| TikTok Pixel | 영숫자 Pixel ID | `SubmitForm` | 기존 ttq·실제 수신 확인 |

9일차 어댑터는 [GTM dataLayer 설치 예시](https://developers.google.com/tag-platform/tag-manager/datalayer), [Google tag 설치 예시](https://developers.google.com/tag-platform/gtagjs), [Google Ads 전환 이벤트 예시](https://developers.google.com/tag-platform/devguides/conversions)를 기준으로 구현했습니다. GTM은 기존 배열을 유지하고 컨테이너 스크립트와 `gtm.js` 초기 이벤트를 한 번만 추가합니다. 전환은 설정된 이벤트명을 `dataLayer.push({event: ...})`로 전달하며 실제 태그 발화는 GTM 컨테이너의 트리거 설정에 달려 있습니다. Google Ads는 기존 `gtag` 함수를 덮어쓰지 않고 AW ID의 `config`와 `gtag('event', 'conversion', {send_to})`를 호출합니다. 같은 AW 스크립트가 이미 있으면 새 스크립트와 `config`를 추가하지 않고, 다른 Google tag 스크립트가 있으면 기존 함수를 사용해 AW 목적지만 구성합니다. 모의 DOM에서만 검증했으며 외부 스크립트의 네트워크 로드·광고 플랫폼 수신은 확인하지 않았습니다.

10일차 Naver 어댑터는 [네이버 `wcs.trans` 설치 가이드](https://naver.github.io/conversion-tracking/pages/01_script_guide_wcstrans/)에 따라 `wcslog.js` 로드 후 `wcs_add.wa` 설정, `wcs.inflow(inflowDomain)`, `wcs_do()`를 실행합니다. 전환은 `wcs.trans({type: conversionType})`로 별도 호출합니다. `inflowDomain`은 공식 가이드의 쿠키 도메인 값이며, 이 SDK는 현재 호스트가 해당 도메인 또는 하위 도메인일 때만 실행합니다. 현재 설정은 호스트만 허용하고 경로 단위 쿠키 도메인은 지원하지 않습니다. `purchase`는 필수 전환 금액 필드가 설정에 없으므로 게시 단계에서 거부합니다. 기존 `_nasa.cnv`가 보이면 충돌을 막지만, 인라인 코드나 GTM 안의 모든 구형 태그를 탐지할 수는 없습니다. 실제 랜딩의 WCS 버전과 실행 주체를 확인한 뒤 활성화해야 합니다. SPA 라우트별 PV 전송은 아직 구현하지 않았습니다.

11일차 당근 어댑터는 [공식 공통 스크립트](https://bizschool.daangn.com/19128c3a-9f8f-8154-b217-d03d2f6ddf5c)의 `karrotPixel` 큐와 `ViewPage`, [서비스 신청 이벤트](https://bizschool.daangn.com/19128c3a-9f8f-8126-bcc3-e287ef8ab51a)의 `SubmitApplication`을 사용합니다. TikTok 어댑터는 [공식 픽셀 코드 예시](https://ads.tiktok.com/gateway/docs/index?doc_id=1701890973258754)의 `ttq.load`, `ttq.page`, 픽셀 인스턴스의 `track('SubmitForm')`을 사용합니다. Meta 어댑터는 `fbq` 큐와 `fbevents.js`를 설치하고 Pixel ID에 한정한 `trackSingle`로 `PageView`와 `Lead`를 보냅니다. Meta 개발자 문서는 이 작업 환경에서 로그인/요청 제한으로 본문을 열 수 없어 실제 Meta 이벤트 관리자에서 호출 계약을 재확인해야 합니다. 세 어댑터 모두 기존 전역 객체의 ID가 큐에서 확인되면 재사용하고, 확인할 수 없으면 실행을 중단합니다. 기존 GTM 내부 픽셀이나 이미 발생한 전환은 자동 판별할 수 없습니다. SPA 라우트별 페이지뷰는 아직 구현하지 않았습니다.

어댑터의 외부 스크립트 URL 검사는 동일한 직접 설치 태그의 중복 삽입을 줄이기 위한 것입니다. next/script의 모든 삽입 방식, 인라인 하드코딩 태그, GTM 컨테이너 내부 태그까지 판별할 수 없습니다. 사용자 확인에 따르면 기존 mleverage.client.js는 문의·페이지뷰용이며 매체 픽셀 점검 대상과 별개입니다. 특히 GTM 컨테이너 안에 같은 Ads 전환이 있으면 직접 Ads 어댑터를 함께 활성화하지 않습니다. 배포 전 원본 코드·컨테이너 인벤토리와 실제 사이트 검증이 필수입니다.

1일차 공식 자료 대조 결과, [Google Ads](https://support.google.com/google-ads/answer/7548399)는 공통 태그와 전환 이벤트의 실행 시점이 다르고 GTM 컨테이너 안에서 이미 구성된 태그도 확인해야 합니다. [Naver WCS](https://naver.github.io/conversion-tracking/pages/01_script_guide_wcstrans/)는 신형 wcs.trans와 구형 wcs.cnv가 같은 전환 지점에 공존하면 중복될 수 있으며, 신형 테스트가 구형 전환 필터링에 영향을 줄 수 있습니다. 실제 랜딩에서 버전을 확인하기 전에는 전환 유형을 임의로 교체하지 않습니다. 상세 확인 표는 [1일차 기록](daily/day-01.md)에 있습니다.

## 전환 흐름

문의 성공 후 발급한 랜덤 token으로 `/complete?token=...`에 이동하면 신규 SDK가 해당 token을 전환 식별자로 사용합니다. 서버 성공 콜백에서 직접 `track('consultation_complete', { eventId })`을 호출하는 방식도 지원하지만 같은 접수에 두 경로를 함께 쓰면 동일한 ID를 전달해야 합니다. **참고 코드 확인:** 기존 랜딩에서 문의 성공 후 /complete?token=...으로 이동하고 완료 페이지가 sessionStorage 토큰을 이용해 Google Ads·Meta 전환 호출을 중복 방지한 사례가 있습니다. **실제 저장소 코드 확인:** 신규 SDK는 초기 진입과 History 이동에서 정확한 /complete 경로의 단일 token을 감지합니다. SDK는 단일 유효 token이 있으면 기본적으로 전환을 시도합니다. 추가 검증이 필요한 사이트는 선택 옵션 `verifyCompletionToken`으로 전환을 거부하거나 ID를 치환할 수 있습니다. 랜딩은 문의 성공 이후에만 완료 경로로 이동해야 합니다. SDK는 siteId·전환 설정 ID·eventId 해시를 자체 sessionStorage 키에 기록해 같은 탭의 뒤로 가기·재방문·새로고침 중복 시도를 막습니다. 게시 버전은 키에 넣지 않습니다. 두 구현의 키가 다르면 모두 전환을 보낼 수 있으므로 키 중복 제거만으로 공존을 보장하지 않습니다. 검증 함수를 제공한 경우 거부·오류 시 경로 기반 전환은 발생하지 않습니다. 랜덤 token 자체는 접수 증명이 아니며 임의 URL 방문도 SDK 내부에서 구별할 수 없습니다. 첫 전송 결과가 불명확할 수 있어 전환 전송은 자동 재시도하지 않습니다.

이전 시에는 siteId·매체·이벤트별로 기존 완료 페이지·직접 태그/GTM/신규 SDK 중 하나만 실행 주체로 둡니다. 신규 SDK는 어댑터 비활성 상태로 관찰한 뒤 테스트 환경에서 한 매체씩 기존 공통 태그와 전환 호출을 끄고 신규 어댑터를 켭니다. 운영용 공존 토글은 아직 구현되지 않았으며 자세한 이전·롤백 순서는 [아키텍처](01-architecture.md)에 기록했습니다.

동의 전에는 start를 호출하지 않는 통합 계약이 필요합니다. 동의 철회와 스크립트 제거, SPA 라우터별 호환성, 제한 시간 내 리다이렉트, 브라우저 차단·오프라인 동작은 실제 랜딩에서 검증해야 합니다. 외부 태그 실패가 문의 접수를 방해해서는 안 됩니다.

## 19일차 설치 준비와 로컬 브라우저 검증

`npm run build:sdk`는 브라우저용 IIFE 파일 `packages/tracking-sdk/dist/landing-tracking-sdk.iife.js`를 생성합니다. 호스트 랜딩은 빌드 결과물을 정적 자산으로 배치하고, 사이트별 `siteId`와 **운영에 배포된** 공개 설정 URL, 실제 동의 상태를 제공해야 합니다. 처음에는 `adapters: {}`로 설치해 설정 조회·라우트 감지만 확인합니다. 특정 매체의 기존 직접 태그와 GTM 내부 전환 주체를 확인하고 끈 뒤에만 해당 매체 어댑터를 주입합니다. 기존 문의·페이지뷰용 `mleverage.client.js`는 이 매체 주체 이전 대상이 아닙니다.

이 저장소의 가상 랜딩 픽스처는 실제 Edge에서 랜덤 token 완료 이동, 실패 시 미이동, 뒤로 가기·재방문 중복 방지, 동의 거부, 외부 태그 차단 시 이동 지연 없음, 기존·신규 전환 코드 동시 활성화 시 2회 시도를 검증합니다. Next.js 프로젝트 원본은 아직 없으므로 `next/script`, 실제 문의 API와 광고 플랫폼 수신은 검증하지 않았습니다. `onDiagnostic`의 `adapter_setup`은 어댑터의 초기화 코드 실행만 뜻하며 외부 네트워크 로드 성공 또는 광고 플랫폼 수신을 뜻하지 않습니다.
