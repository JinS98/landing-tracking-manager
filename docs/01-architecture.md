# 시스템 아키텍처

```text
Next.js 랜딩 ──[배포 성공/인증된 CLI]──> registerSite Function ──> Firestore
      │                                                   ▲
      └── tracking-sdk ──> getTrackingConfig (published)    │
                                     ▲                     │
                              React 관리자 ── publishConfig
```

## 경계
- 관리자 앱은 인증된 운영자만 편집 가능.
- Cloud Functions에서 게시 승인, 입력 검증, 변경 로그를 처리.
- 공개 SDK 설정 응답에는 비밀키/관리자 정보가 없어야 함.
- SDK 로더는 사이트 ID 및 환경을 식별하고 매체별 초기화 순서와 중복 방지를 담당.
- 기존 MLeverage SDK는 변경하지 않으며 tracking-core를 독립 모듈로 유지.
- 운영 빌드와 실제 배포 성공을 구분; 가급적 배포 성공 시 업체 등록.

## 단계별 마이그레이션
1. SDK 설치만 하고 전환은 비활성화.
2. 기존 태그 및 GTM 내부 태그와 중복 여부 점검.
3. 매체별로 기존 하드코딩 태그 제거와 SDK 활성화를 묶어 적용.
4. 광고 플랫폼 진단 도구로 검증.
