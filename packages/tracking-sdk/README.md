## tracking-sdk

게시 설정 조회, 제한된 fetch 재시도, 중복 시도 방지, History API 및 /complete?token 감지, 매체 어댑터 인터페이스를 포함합니다. GTM과 Google Ads의 직접 설치 어댑터는 `createGtmAdapter()`와 `createGoogleAdsAdapter()`로 제공하며 **명시적으로 주입했을 때만** 사용합니다. Naver WCS·당근·Meta·TikTok 어댑터와 배포 번들은 아직 없습니다. `start`는 동의를 받은 뒤 호출해야 하며, `track`은 실제 문의 성공 시 고유 eventId와 함께 호출하도록 설계했습니다. GTM 컨테이너 내부의 Ads 태그와 기존 하드코딩 태그를 확인하기 전에는 같은 전환에 두 실행 주체를 켜지 않습니다. 현재 검증은 모의 DOM 테스트이며 실제 랜딩·Tag Assistant·광고 플랫폼 수신 결과는 확인되지 않았습니다. docs/03-sdk-spec.md 참조.
