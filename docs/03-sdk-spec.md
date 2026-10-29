# Tracking SDK 명세 (구현 예정)

## 매체별 설정
| 매체 | 공통 | 전환 |
|---|---|---|
| GTM | GTM 컨테이너 ID | dataLayer 이벤트 |
| Google Ads | AW ID | send_to (AW-ID/라벨) |
| Naver WCS | WA ID, inflow 도메인 | type: lead 등 |
| 당근 | 픽셀 ID | 공식 지원 이벤트 |
| Meta | 픽셀 ID | Lead 등 |
| TikTok | 픽셀 ID | 공식 지원 이벤트 |

## 초기화
1. 사이트 ID 확인
2. 게시 설정 fetch (캐시·타임아웃)
3. 활성 공통 스크립트만 로드
4. 동의 상태 확인 후 허용된 태그 실행
5. 완료 이벤트가 발생하면 전환 어댑터 호출

## 전환
- 단기: `/complete?token=...` 감지 및 Next.js SPA 네비게이션 감지.
- 장기: `track('consultation_complete', { conversionId })`처럼 문의 성공 시 명시적 호출.
- `token`은 서버 검증된 접수 증거가 아니므로 보안 검증 대체 불가.
- sessionStorage 중복 방지는 보조 수단. 브라우저 재시도와 플랫폼 중복 집계 방지 전략을 별도 수립.
- 전송 시도 성공과 광고 플랫폼 실제 집계는 다름.
- 페이지가 3초 내 이동하므로 초기 설정 사전 로딩 및 비동기 경합 점검.
- GTM과 Google Ads가 dataLayer를 공유할 수 있으므로 전역 함수 재정의 금지.
- GTM noscript iframe은 JS SDK만으로 대체할 수 없음.
