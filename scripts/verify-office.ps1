# Non-DB Office checks. The deliberately unreachable endpoints prevent accidental DB/Redis use.
$ErrorActionPreference = 'Stop'
$env:NODE_ENV = 'test'
$env:DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused'
$env:REDIS_URL = 'redis://127.0.0.1:1'
$env:BETTER_AUTH_SECRET = 'office-tests-only-placeholder-secret'
$env:PAYMENT_WEBHOOK_SECRET = 'office-tests-only-placeholder-secret'
$env:BETTER_AUTH_URL = 'http://localhost:3000'
$env:CORS_ORIGIN = 'http://localhost:3001'
bun test apps/server/src/office packages/env/src/admin-office.test.ts packages/env/src/server.test.ts packages/api/src/modules/office packages/auth/src/signup-source.test.ts apps/web/src/lib/signup-source.test.ts packages/api/src/tests/unit/office-actions.test.ts packages/api/src/tests/unit/office-actions-service.test.ts packages/api/src/tests/unit/office-snapshot.test.ts packages/api/src/tests/unit/faq.service.test.ts packages/api/src/tests/unit/activity-article.test.ts packages/api/src/tests/unit/blog.service.test.ts packages/api/src/tests/unit/content-admin.test.ts packages/api/src/tests/unit/referral.policy.test.ts packages/api/src/tests/unit/private-kb-storage.test.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
# Module replacements stay in separate processes, matching the coverage runner partitions.
foreach ($officeSuite in @('office-actions-adapters', 'office-worker', 'office-snapshot-wrapper')) {
  bun test "packages/api/src/tests/isolated/$officeSuite.test.ts"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
exit 0
