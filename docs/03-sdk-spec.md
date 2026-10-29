# Tracking SDK 명세

## 현재 코드 범위

tracking-core는 공개 설정을 검증하고 허용 필드만 반환합니다. tracking-sdk는 게시 설정 로더, fetch 최대 2회, 타임아웃, 사이트별 태그 로딩 중복 방지, History API와 popstate 이동 감지, /complete?token 자동 이벤트, sessionStorage 중복 시도 방지, track('consultation_complete', { eventId }) 인터페이스를 제공합니다. 실제 매체 어댑터와 번들/배포는 아직 없습니다. 따라서 현재 SDK만 설치해도 광고 태그는 실행되지 않습니다.

## 공개 설정과 로딩

SDK는 siteId로 공개 게시본만 요청합니다. 응답은 schemaVersion=1과 정확한 siteId를 가져야 하며, 검증 실패 시 태그를 실행하지 않습니다. 비밀키·임의 JS·초안은 응답에 넣지 않습니다. 서버/CDN은 ETag와 짧은 캐시 TTL(초기 권장 60초)을 제공하고, 게시/롤백 시 캐시 무효화를 수행해야 합니다. TTL과 배포 원자성은 운영 검증 후 확정합니다.

## 어댑터 계약

각 매체는 공통 태그 load와 전환 convert를 별도로 구현합니다. 설정에는 코드 대신 검증된 ID·이벤트명만 둡니다. 현재 주입 인터페이스만 있고 6개 어댑터 구현은 남아 있습니다.

| 매체 | 공통 입력 | 전환 입력 | 검증 과제 |
|---|---|---|---|
| GTM | 컨테이너 ID | dataLayer 이벤트명 | 기존 컨테이너·noscript 처리 |
| Google Ads | AW ID | send_to | dataLayer/gtag 공유와 중복 |
| Naver WCS | WA ID, 유입 도메인 | 전환 유형 | 공식 로더와 도메인 정책 |
| 당근 Pixel | 픽셀 ID | 지원 이벤트명 | 공식 SDK API 확인 |
| Meta Pixel | Pixel ID | 이벤트명 | 기존 fbq 확인 |
| TikTok Pixel | Pixel ID | 이벤트명 | 기존 ttq 확인 |

어댑터는 전역 객체를 임의 재정의하지 않고 기존 GTM/Google Ads dataLayer와 협력해야 합니다. 현재 SDK의 script src 검사만으로 인라인 하드코딩 태그나 GTM 내부 태그까지 발견할 수 없으므로 배포 전 수동 태그 인벤토리와 실제 사이트 검증이 필수입니다.

1일차 공식 자료 대조 결과, [Google Ads](https://support.google.com/google-ads/answer/7548399)는 공통 태그와 전환 이벤트의 실행 시점이 다르고 GTM 컨테이너 안에서 이미 구성된 태그도 확인해야 합니다. [Naver WCS](https://naver.github.io/conversion-tracking/pages/01_script_guide_wcstrans/)는 신형 wcs.trans와 구형 wcs.cnv가 같은 전환 지점에 공존하면 중복될 수 있으며, 신형 테스트가 구형 전환 필터링에 영향을 줄 수 있습니다. 실제 랜딩에서 버전을 확인하기 전에는 전환 유형을 임의로 교체하지 않습니다. 상세 확인 표는 [1일차 기록](daily/day-01.md)에 있습니다.

## 전환 흐름

실제 문의 성공 콜백에서 고유 eventId와 함께 track을 호출하는 방식이 목표입니다. 단기 호환을 위해 /complete?token=... 진입 또는 Next.js식 client navigation을 감지합니다. token은 접수 증명이 아니며 서버 검증을 대체하지 않습니다. eventId 해시를 sessionStorage에 기록해 동일 세션의 중복 시도를 줄입니다. 첫 전송 결과가 불명확할 수 있어 전환 전송은 자동 재시도하지 않습니다.

동의 전에는 start를 호출하지 않는 통합 계약이 필요합니다. 동의 철회와 스크립트 제거, SPA 라우터별 호환성, 제한 시간 내 리다이렉트, 브라우저 차단·오프라인 동작은 실제 랜딩에서 검증해야 합니다. 외부 태그 실패가 문의 접수를 방해해서는 안 됩니다.
