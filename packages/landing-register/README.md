## landing-register

배포 성공 후 `siteId`로 사이트를 등록할 CLI입니다. Node.js 22.14+에서 기본 실행은 입력 검증과 **dry run**만 수행합니다.

```bash
npm run register -w @ltm/landing-register -- --site-id sample-site --company-id sample-company --domain landing.example --environment staging
```

`--apply`는 CI/배포 파이프라인의 `LTM_REGISTER_API_URL`(HTTPS의 `/internal/sites/register`)과 `LTM_DEPLOY_TOKEN`이 모두 있어야 전송합니다. 토큰을 명령줄 인수나 로그에 넣지 않습니다. 5xx/네트워크 실패에 한해 최대 한 번 재시도하며, 409 충돌은 재시도하지 않습니다. 이 저장소에는 **실제 인증 검증기와 HTTP 등록 API가 없으므로** 현재 운영 등록에 사용할 수 없습니다. 서버 측 Firestore 트랜잭션은 `functions/src/registerSite.ts`에 있으며 로컬 에뮬레이터에서만 검증했습니다. 회사의 배포 주체 자격 증명 연결과 실제 API 배포는 별도 작업입니다.
