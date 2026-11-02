# 12일차 — 공개 설정 API

공개 설정 HTTP 핸들러와 Firestore 게시본 리더를 구현했습니다. 운영 서버/CDN에는 아직 배포하지 않았습니다.

## 개발 목표

SDK가 사이트별 게시본만 조회하는 별도 API를 구현한다.

## 구현 기능

- siteId 조회
- 공개 JSON
- ETag/TTL
- 비밀 필드 제거

## 수정 또는 생성할 파일

- functions/src/
- packages/tracking-core/src/index.ts
- docs/04-api-spec.md

## 구체적인 작업 순서

1. 게시본 투영
2. 서버/CDN 응답
3. 캐시 무효화
4. 미게시 404 처리

## 테스트 방법

- 초안·감사 로그 미노출
- siteId 오류
- 캐시 갱신

## 완료 체크리스트

- [x] 관리자 쓰기 경로와 공개 읽기 경로를 코드에서 분리
- [x] 변경 내용과 테스트 결과를 이 문서에 기록

## 다음 일차 작업과의 연관성

13일차 SDK 로더의 입력이 된다.

## 작업 메모

- 구현 파일: `functions/src/publicConfig.ts`, `packages/tracking-core/src/index.ts`의 공통 siteId 검사, `tests/public-config.test.mjs`, `tests/public-config-firestore.test.mjs`.
- 응답 계약: `GET`·`HEAD /tracking-config?siteId=...`; Firestore `publishedVersion` 포인터와 불변 릴리스만 조회한다. 공개 DTO로 투영한 JSON과 SHA-256 ETag를 반환하고, 같은 ETag는 `304`로 재검증한다. 미게시 사이트는 `404`, 잘못된 ID는 `400`, 저장소 불일치는 `503`이다. 허용된 HTTPS Origin에만 CORS 헤더를 보낸다.
- 캐시 정책: `max-age=0, s-maxage=0, must-revalidate`로 브라우저·공유 캐시 재검증을 요구한다. 포인터 변경 뒤 원본 응답은 곧바로 새 ETag와 버전을 제공한다. CDN purge가 연결되기 전에는 양수 TTL을 사용하지 않는다.
- 테스트 결과: `npm test` 42개(공개 HTTP 신규 3개), `npm run test:public-config` Firestore 에뮬레이터 1개, `npm run typecheck`, `npm run build` 통과. 초안·감사·운영자 필드 미노출, siteId 오류, 미게시 404, ETag 갱신, 릴리스 누락 시 503을 확인했다.
- 남은 이슈: 서버 게시·롤백 쓰기, 공개 핸들러 마운트·배포, TLS/CDN·속도 제한·캐시 purge는 아직 구현되지 않았다. 실제 Firebase 프로젝트 연결이나 운영 수신은 검증하지 않았다.
