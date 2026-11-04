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
    const { TrackingSdk } = window.LandingTrackingSdk;
    const sdk = new TrackingSdk({
      siteId: SITE_ID,
      configUrl: 'https://pixel-manager.web.app/tracking-config',
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

사이트의 동의 관리 API에 `hasConsent`를 연결해야 매체 스크립트가 실행된다. SDK는 게시본에서 활성화된 매체의 내장 어댑터를 자동 사용한다. 기존 매체 태그가 같은 이벤트를 이미 전송한다면 해당 매체의 실행 주체를 하나로 정리한다. 새 매체 구현이나 SDK 동작 변경은 중앙 SDK 번들 배포가 필요하지만 랜딩 코드는 다시 배포하지 않는다. 문의·페이지뷰용 기존 SDK는 이 매체 SDK와 별개다. 사이트의 CSP가 있다면 `script-src`와 `connect-src`에 `https://pixel-manager.web.app`을 허용한다.

관리자 설치 진단은 랜딩 브라우저가 보낸 초기화 신호의 수신 시각이다. 광고 플랫폼의 전환 수신을 증명하지 않으므로 실제 사이트와 각 매체 진단 도구에서 별도로 확인한다. 현재 저장소에는 실제 랜딩 소스가 없어 사이트 코드 적용은 사용자가 수행한다.

## 당근 전용 가상 ID 예시

이 예시는 **관리자 저장 → 게시 → SDK 설정 조회** 흐름을 확인하기 위한 가상 값이다. `KARROTDEMO123`은 이 프로젝트의 입력 형식을 통과하지만 당근이 발급한 전환 추적 코드 ID가 아니므로 당근 광고주센터의 이벤트 수신 검증에는 쓸 수 없다. 실제 수신 테스트에서는 [당근 웹사이트 연동 가이드](https://bizschool.daangn.com/19128c3a-9f8f-8154-b217-d03d2f6ddf5c)에 따라 전문가모드에서 발급한 ID와 등록된 실제 HTTPS 도메인을 사용한다.

관리자에서 별도 테스트 업체·사이트를 만든 뒤 다음 값으로 **설정 추가**를 각각 누르고, 초안 버전이 증가한 것을 확인한 후 **설정 게시**를 누른다. 기존 운영 사이트 `test`의 `investment-ana.web.app`에는 가상 픽셀을 게시하지 않는다.

| 항목 | 예시 입력 |
| --- | --- |
| 업체 ID / 이름 | `karrot-demo-company` / `당근 흐름 테스트` |
| 사이트 ID / 도메인 | `karrot-demo` / `landing.example` (가상 도메인) |
| 공통 스크립트 | 매체 `당근`, 추적 ID `KARROTDEMO123` |
| 전환 이벤트 | 매체 `당근`, 이벤트명 `SubmitApplication` |

게시 후 `https://pixel-manager.web.app/tracking-config?siteId=karrot-demo`에서 `common`의 `provider: "karrot"`, `trackingId: "KARROTDEMO123"`와 `conversions`의 `eventName: "SubmitApplication"`이 반환되어야 한다. 위 가상 도메인은 SDK 실행용 사이트가 아니므로 이 단계에서는 관리자·공개 API만 검증한다.

실제 랜딩에 당근 ID를 적용할 때는 아래 예시의 `SITE_ID`를 관리자에 등록·게시한 **실제** 사이트 ID로 바꾸고, 관리자 공통 스크립트의 추적 ID도 당근에서 발급한 ID로 바꾼다. SDK는 공개 설정을 읽어 당근 스크립트를 로드하며 `ViewPage`와 `SubmitApplication`을 호출하므로 당근 원본 픽셀 코드를 별도로 중복 삽입하지 않는다.

```html
<!-- 모든 랜딩 페이지와 /complete 페이지에 로드 -->
<script src="https://pixel-manager.web.app/sdk/landing-tracking-sdk.iife.js" defer></script>
<script>
  const SITE_ID = 'karrot-demo'; // 실제 사이트 ID로 교체

  window.addEventListener('DOMContentLoaded', () => {
    const { TrackingSdk, createKarrotAdapter } = window.LandingTrackingSdk;
    const sdk = new TrackingSdk({
      siteId: SITE_ID,
      configUrl: 'https://pixel-manager.web.app/tracking-config',
      adapters: { karrot: createKarrotAdapter() },
      hasConsent: () => typeof window.hasAdConsent === 'function' && window.hasAdConsent() === true,
      verifyCompletionToken: async token =>
        sessionStorage.getItem(`ltm:completed:${SITE_ID}:${token}`) === '1'
          ? { eventId: token }
          : null,
      onError: error => console.error('당근 SDK 초기화 오류:', error),
    });
    void sdk.start();
  });

  // 기존 문의 저장 API가 성공한 뒤에만 호출한다.
  function afterInquirySaved() {
    const token = crypto.randomUUID();
    sessionStorage.setItem(`ltm:completed:${SITE_ID}:${token}`, '1');
    window.location.assign(`/complete?token=${encodeURIComponent(token)}`);
  }
</script>
```

`afterInquirySaved()`는 샘플 함수이며 실제 문의 성공 처리에서 호출해야 한다. 실패·중복 제출·저장 중에는 호출하지 않는다. SDK는 같은 탭에서 `/complete` 새로고침이나 뒤로 가기로 재방문해도 같은 토큰의 전환을 다시 시도하지 않는다. 동의 확인 함수 `hasAdConsent`가 없거나 `false`면 매체 스크립트가 실행되지 않는다. 사이트 CSP에는 `script-src`에 `https://pixel-manager.web.app`과 `https://karrot-pixel.business.daangn.com`, `connect-src`에 `https://pixel-manager.web.app`과 당근 픽셀의 실제 전송 주소가 필요할 수 있으므로 브라우저 네트워크 오류를 보며 조정한다. 실제 당근 수신은 [당근 이벤트 테스트](https://business.daangn.com/notice/detail/422)에서 확인한다.
