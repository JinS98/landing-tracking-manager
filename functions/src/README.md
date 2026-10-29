## functions

관리자 쓰기 API와 공개 SDK 설정 조회 API를 분리해 구현할 서버 영역입니다. access.ts에는 게이트 검증과 관리자 인가 인터페이스만 있고 실행 가능한 API는 없습니다. 사내 접근 게이트·운영자 검증·Firestore Rules가 마련되기 전에는 관리자 쓰기 경로를 배포하지 않습니다. docs/01-architecture.md, docs/04-api-spec.md, docs/05-security.md 참조.
