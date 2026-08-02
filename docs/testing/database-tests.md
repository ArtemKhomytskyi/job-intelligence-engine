# Database integration tests

Database repository tests use real PostgreSQL 17 and are deliberately separate from `npm test`. They never mock Prisma.

Chunk 7 coverage loads the latest report and full score breakdown, verifies
automatic VIEWED idempotency and APPLIED history/protection, reloads
authoritative status, and runs a true local flow: fixture collection →
persistence → processing → scoring/selection → batch persistence → ephemeral
report → Chromium status update → PostgreSQL assertion. No external internet
service is used.

Set the dedicated local URL (PowerShell example), start the isolated Compose project, reset/apply migrations, and run tests:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://jie_test:jie_test_local_password@localhost:5433/jie_test?schema=public'
npm run db:test:up
npm run db:test:reset
npm run test:db
npm run db:test:down
```

The reset/migration script refuses a missing URL, a non-PostgreSQL URL, a non-localhost host, or a database name without a standalone `test` marker separated by `_` or `-`. It copies the verified test URL into the child Prisma process only. The separate Compose file uses its own project, port, database, and volume; teardown removes only that test volume.

Tests remove synthetic rows in dependency order before each case and run with one worker. They cover source idempotency, job matching/linking/revisions/timestamps, status history, score history/components, recommendation uniqueness/order, collection results, and transaction rollback. Tests do not depend on execution order or external network access.

CI supplies `TEST_DATABASE_URL`, starts a PostgreSQL 17 service, applies committed migrations, and runs `npm run verify:full`. `npm test` remains fast and database-independent; `npm run test:db` is the explicit repository suite.

Unit coverage intentionally excludes Prisma adapters, database command composition, and the thin persistence use-case delegates because those paths require and are exercised by the separate real-database suite. It does not replace repository integration verification with mocks.
