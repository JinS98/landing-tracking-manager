# Landing Tracking Manager

광고주 랜딩페이지 통합 광고 스크립트 관리 플랫폼의 **관리자 페이지 기본 구조**입니다.

## 실행

```bash
npm install
npm run dev
```

Node.js 20.19+ 권장. `http://localhost:5173` 접속.

## 현재 구현된 기능
- React 19 + TypeScript + Vite 기반 반응형 관리자 UI
- 대시보드 / 업체 목록·검색 / 업체별 스크립트 편집
- GTM, Google Ads, Naver WCS, 당근, Meta, TikTok 설정 폼
- 공통 스크립트와 전환 이벤트 분리, 공통 매체 연결 여부 확인
- 설정 활성화/비활성화·삭제·JSON 복사 (메모리 기반 데모)
- Firebase 클라이언트 초기화 준비 (`apps/admin/.env.example`)

## 아직 구현되지 않은 기능
- Firebase Auth 로그인 및 Firestore 저장
- Cloud Functions, SDK, 업체 자동 등록 CLI 실제 구현
- 설정 게시/롤백, 설치 진단, 실제 광고 태그 실행

**주의:** 현재 앱은 데모입니다. 설정은 새로고침 시 초기화되며 광고 플랫폼에 아무 데이터도 전송하지 않습니다. `VITE_DEMO_MODE=false`로 바꿔도 CRUD가 자동 연결되지는 않습니다. 프로덕션 사용 금지.

## 폴더
- `apps/admin`: 관리자 React 앱
- `packages/tracking-core`: 추후 어댑터 공통 로직
- `packages/tracking-sdk`: 추후 브라우저 SDK
- `packages/landing-register`: 추후 운영 빌드/배포 등록 CLI
- `functions`: 추후 Cloud Functions
- `docs`: 아키텍처, 보안, API, 테스트, 20일 개발 일정

[기획서 (Notion)](https://app.notion.com/p/408c883fa202812ba344f9355cedfb64)
