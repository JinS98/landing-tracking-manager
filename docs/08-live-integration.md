# 운영 연결 및 랜딩 SDK 설치

Firebase 프로젝트 `landing-tracking`의 Google 로그인 제공자, Firestore Rules·인덱스, Functions 3개, 관리자 Hosting과 SDK 번들을 배포했다. 라이브의 비로그인 관리자 API는 401, 미게시 사이트 설정은 404, SDK 번들은 200으로 확인했다. 실제 계정 로그인, 사이트 등록·게시, 랜딩에 설치한 뒤 광고 플랫폼 수신은 아직 확인해야 한다.

## 관리자와 데이터 흐름

관리자 주소: `https://pixel-manager.web.app`. Google 로그인 후 서버는 Firebase ID 토큰을 검증하고 `functions/.env.landing-tracking`의 `ADMIN_EMAIL`과 일치하는 계정만 허용한다. 브라우저의 Firestore 직접 접근은 Rules에서 차단한다.

1. 관리자에서 업체 ID·이름을 등록한다.
2. 업체에 사이트 ID와 실제 랜딩 도메인을 등록한다. 한 업체에 사이트를 여러 개 둘 수 있다.
3. 사이트의 공통 매체 스크립트와 문의 완료 전환을 초안에 저장한다.
4. 설정을 게시한다. SDK는 `https://pixel-manager.web.app/tracking-config?siteId=<siteId>`의 게시본만 읽는다. 초안은 공개되지 않는다.
5. 필요하면 관리자에서 이전 릴리스로 롤백한다. 이전 내용이 새 릴리스로 게시된다.

운영 배포: Google 제공자는 `firebase deploy --only auth --project landing-tracking`으로 활성화했고 `pixel-manager.web.app`의 승인도 확인했다. `npm run typecheck`, `npm test`, `npm run build` 후 Functions를 먼저 배포하고 Firestore·Hosting을 배포했다. 재배포 명령과 복구 절차는 [배포 기록](07-deployment.md)을 따른다. Functions 환경 파일에는 `ADMIN_EMAIL`과 `ADMIN_ORIGIN=https://pixel-manager.web.app`를 설정한다. 웹 앱의 공개 Firebase 설정은 `apps/admin/.env.production`에 있다. SDK 번들은 빌드 시 Hosting의 `/sdk/landing-tracking-sdk.iife.js`에 복사된다.

## 랜딩에 넣을 코드

아래의 `SITE_ID`와 동의 확인 함수는 해당 사이트에 맞게 지정한다. 문의 성공 처리에서만 랜덤 토큰을 만들고 같은 탭의 `sessionStorage`에 기록한다. 실패하거나 아직 저장 중일 때는 `/complete`로 이동하지 않는다.

```html
<script src="https://pixel-manager.web.app/sdk/landing-tracking-sdk.iife.js" defer></script>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    const SITE_ID = 'your-site-id';
    const { TrackingSdk, createGtmAdapter, createGoogleAdsAdapter,
      createNaverWcsAdapter, createKarrotAdapter, createMetaAdapter,
      createTikTokAdapter } = window.LandingTrackingSdk;
    const sdk = new TrackingSdk({
      siteId: SITE_ID,
      configUrl: 'https://pixel-manager.web.app/tracking-config',
      adapters: {
        gtm: createGtmAdapter(), googleAds: createGoogleAdsAdapter(),
        naverWcs: createNaverWcsAdapter(), karrot: createKarrotAdapter(),
        meta: createMetaAdapter(), tiktok: createTikTokAdapter(),
      },
      hasConsent: () => typeof window.hasAdConsent === 'function' && window.hasAdConsent() === true,
      verifyCompletionToken: async token =>
        sessionStorage.getItem(`ltm:completed:${SITE_ID}:${token}`) === '1' ? { eventId: token } : null,
      onDiagnostic: signal => {
        void fetch('https://pixel-manager.web.app/tracking-diagnostic', {
          method: 'POST', mode: 'cors', keepalive: true,
          headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(signal),
        }).catch(() => {});
      },
      onError: error => console.error('Tracking SDK:', error),
    });
    void sdk.start();
  });

  // 기존 문의 API가 성공했다고 확정된 지점에서 실행한다.
  function afterInquirySaved() {
    const SITE_ID = 'your-site-id';
    const token = crypto.randomUUID();
    sessionStorage.setItem(`ltm:completed:${SITE_ID}:${token}`, '1');
    history.pushState({}, '', `/complete?token=${encodeURIComponent(token)}`);
  }
</script>
```

사이트의 동의 관리 API에 `hasConsent`를 연결해야 매체 스크립트가 실행된다. 기존 매체 태그가 같은 이벤트를 이미 전송한다면 해당 매체의 실행 주체를 하나로 정리한다. 문의·페이지뷰용 기존 SDK는 이 매체 SDK와 별개다. 사이트의 CSP가 있다면 `script-src`와 `connect-src`에 `https://pixel-manager.web.app`을 허용한다.

관리자 설치 진단은 랜딩 브라우저가 보낸 초기화 신호의 수신 시각이다. 광고 플랫폼의 전환 수신을 증명하지 않으므로 실제 사이트와 각 매체 진단 도구에서 별도로 확인한다. 현재 저장소에는 실제 랜딩 소스가 없어 사이트 코드 적용은 사용자가 수행한다.
