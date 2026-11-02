# Tracking SDK 명세

## 현재 코드 범위

tracking-core는 초안과 공개 설정을 같은 매체별 규칙으로 검증하고, 데모 게시 시 공개 필드만 투영합니다. 허용되지 않은 필드가 있으면 읽기를 거부합니다. tracking-sdk는 게시 설정 로더, fetch 최대 2회, 타임아웃, 사이트별 태그 로딩 중복 방지, History API와 popstate 이동 감지, /complete?token 자동 이벤트, sessionStorage 중복 시도 방지, track('consultation_complete', { eventId }) 인터페이스를 제공합니다. 6개 매체 어댑터는 **선택적 주입 모듈**입니다. 실제 랜딩 수신 검증과 SDK 번들/배포는 아직 없습니다. 어댑터를 주입하지 않은 SDK는 광고 태그를 실행하지 않습니다.

**실제 저장소 코드 확인:** 위 범위는 현재 tracking-core·tracking-sdk 소스에서 확인했다. **참고 코드 확인:** 사용자 제공 기존 랜딩 사례에는 app/layout.tsx의 next/script 공통 태그, mleverage.client.js, /complete?token 이동, 완료 페이지의 sessionStorage 중복 방지 및 Google Ads·Meta 전환 호출, Naver WCS 사용 경험이 포함된다. 원본 랜딩 코드를 이번 작업에서 열어 확인한 것은 아니다. **운영 환경 검증 필요:** 실제 설치 위치와 동작, GTM 내부 설정, Naver WCS 호출 버전, 플랫폼 수신 결과.

## 공개 설정과 로딩

SDK는 siteId로 공개 게시본만 요청합니다. 응답은 schemaVersion=1과 정확한 siteId를 가져야 하며, 검증 실패 시 태그를 실행하지 않습니다. 비밀키·임의 JS·초안은 응답에 넣지 않습니다. 12일차 공개 HTTP 핸들러는 ETag와 0초 TTL을 제공하여 매 요청 재검증합니다. 서버 마운트·CDN 배포와 게시/롤백 시 캐시 purge는 아직 없습니다. 양수 TTL은 이 경로를 연결하고 운영 검증한 뒤에만 설정합니다.

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

어댑터의 외부 스크립트 URL 검사는 동일한 직접 설치 태그의 중복 삽입을 줄이기 위한 것입니다. next/script의 모든 삽입 방식, 인라인 하드코딩 태그, mleverage.client.js 내부 동작, GTM 컨테이너 내부 태그까지 판별할 수 없습니다. 특히 GTM 컨테이너 안에 같은 Ads 전환이 있으면 직접 Ads 어댑터를 함께 활성화하지 않습니다. 배포 전 원본 코드·컨테이너 인벤토리와 실제 사이트 검증이 필수입니다.

1일차 공식 자료 대조 결과, [Google Ads](https://support.google.com/google-ads/answer/7548399)는 공통 태그와 전환 이벤트의 실행 시점이 다르고 GTM 컨테이너 안에서 이미 구성된 태그도 확인해야 합니다. [Naver WCS](https://naver.github.io/conversion-tracking/pages/01_script_guide_wcstrans/)는 신형 wcs.trans와 구형 wcs.cnv가 같은 전환 지점에 공존하면 중복될 수 있으며, 신형 테스트가 구형 전환 필터링에 영향을 줄 수 있습니다. 실제 랜딩에서 버전을 확인하기 전에는 전환 유형을 임의로 교체하지 않습니다. 상세 확인 표는 [1일차 기록](daily/day-01.md)에 있습니다.

## 전환 흐름

실제 문의 성공 콜백에서 고유 eventId와 함께 track을 호출하는 방식이 목표입니다. **참고 코드 확인:** 기존 랜딩에서 문의 성공 후 /complete?token=...으로 이동하고 완료 페이지가 sessionStorage 토큰을 이용해 Google Ads·Meta 전환 호출을 중복 방지한 사례가 있습니다. **실제 저장소 코드 확인:** 신규 SDK는 /complete?token 진입 또는 Next.js식 client navigation을 감지하고 eventId 해시를 자체 sessionStorage 키에 기록합니다. 두 구현의 키가 다르면 모두 전환을 보낼 수 있으므로 키 중복 제거만으로 공존을 보장하지 않습니다. token은 접수 증명이 아니며 서버 검증을 대체하지 않습니다. 첫 전송 결과가 불명확할 수 있어 전환 전송은 자동 재시도하지 않습니다.

이전 시에는 siteId·매체·이벤트별로 기존 완료 페이지/GTM/기존 SDK/신규 SDK 중 하나만 실행 주체로 둡니다. 신규 SDK는 어댑터 비활성 상태로 관찰한 뒤 테스트 환경에서 한 매체씩 기존 공통 태그와 전환 호출을 끄고 신규 어댑터를 켭니다. 운영용 공존 토글은 아직 구현되지 않았으며 자세한 이전·롤백 순서는 [아키텍처](01-architecture.md)에 기록했습니다.

동의 전에는 start를 호출하지 않는 통합 계약이 필요합니다. 동의 철회와 스크립트 제거, SPA 라우터별 호환성, 제한 시간 내 리다이렉트, 브라우저 차단·오프라인 동작은 실제 랜딩에서 검증해야 합니다. 외부 태그 실패가 문의 접수를 방해해서는 안 됩니다.
