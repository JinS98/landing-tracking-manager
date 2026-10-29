# 3일차 — Firestore 및 보안 규칙

이 문서는 작업 계획입니다. 체크리스트는 해당 일차의 실제 검증 후 표시합니다.

## 개발 목표

기존 6개 컬렉션 모델과 서버 전용 쓰기 정책을 설계한다.

## 구현 기능

- companies/sites/trackingConfigs/trackingReleases/auditLogs/importJobs
- 버전·siteId 고유성

## 수정 또는 생성할 파일

- docs/02-database.md
- docs/05-security.md
- firestore.rules
- functions/src/README.md

## 구체적인 작업 순서

1. 문서 ID와 관계 정의
2. 공개/비공개 필드 분리
3. Rules 거부 정책 및 인덱스 계획

## 테스트 방법

- 에뮬레이터 구축 후 익명 쓰기·초안 읽기 거부 테스트를 작성

## 완료 체크리스트

- [ ] 스키마·접근 정책 초안과 검증 항목 완성
- [ ] 변경 내용과 테스트 결과를 이 문서에 기록

## 다음 일차 작업과의 연관성

4일차 게이트의 권한 검사와 5일차 등록 트랜잭션을 구체화한다.

## 작업 메모

- 구현 파일:
- 테스트 결과:
- 남은 이슈:
