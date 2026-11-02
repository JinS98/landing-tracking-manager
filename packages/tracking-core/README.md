## tracking-core

초안과 공개 게시 설정의 공통 타입·런타임 검증을 제공합니다. `parseDraftConfig`는 편집본을 저장하기 전에, `projectPublishedConfig`는 공개 DTO를 만들 때, `parsePublishedConfig`는 SDK가 게시본을 읽을 때 사용합니다. 세 함수는 같은 매체별 필수 필드·형식·관계 검증을 공유하며 허용되지 않은 필드와 임의 JavaScript를 거부합니다. 서버 게시 API는 아직 미구현입니다. 자세한 내용은 docs/02-database.md와 docs/03-sdk-spec.md를 참조하세요.
