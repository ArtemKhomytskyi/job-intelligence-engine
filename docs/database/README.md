# Database operations

PostgreSQL 17 and committed Prisma migrations are the persistence baseline. Copy `.env.example` to ignored `.env`, keep `DATABASE_URL` aligned with the main Compose service, then use:

```sh
npm run db:up
npm run prisma:migrate:deploy
npm run cli -- db:check
npm run cli -- db:status
```

`db:check` runs a safe `SELECT 1` health query and always disconnects. `db:migrate` wraps `prisma migrate deploy`; `db:status` wraps `prisma migrate status`. Normal CLI errors use stable codes and never print a connection URL or raw Prisma message.

Use `npm run prisma:migrate:dev -- --name <name>` only while authoring a migration against a disposable local development database. CI and normal runtime use `npm run prisma:migrate:deploy`. Migration history is committed under `prisma/migrations`; never edit an already-applied migration.

All stored timestamps use PostgreSQL `timestamptz(3)` and are mapped to UTC ISO-8601 strings. Money uses `decimal(14,2)` with separate currency/period columns. Score values use `decimal(7,4)`.

Migration `20260729223000_job_processing_decisions` adds current normalized query fields and payload to `Job`, immutable `JobProcessingDecision` provenance, and aggregate `JobProcessingRun` records. Its compound unique constraint enforces one decision per job revision, processing versions, and configuration fingerprint. Status, run, primary duplicate, and fixed-length fingerprint indexes support bounded processing and later queries. Canonical URLs and combined normalized text are deliberately not B-tree indexed because their validated maximum sizes can exceed PostgreSQL's index-row limit; the current bounded processor compares them in memory.

`npm run db:down` stops the main service without deleting its named volume. `docker compose down --volumes` destroys local developer data and must be deliberate. Application code provides no hard-delete workflow.

For the isolated test database, follow [database test guidance](../testing/database-tests.md). Local/test passwords in Compose and CI are development-only defaults and must never be reused for production.

The Chunk 5 PostgreSQL verification sequence uses only the disposable test
service and guarded URL:

```powershell
docker compose -f docker-compose.test.yml config
docker compose -f docker-compose.test.yml up -d --wait
$env:TEST_DATABASE_URL = 'postgresql://jie_test:jie_test_local_password@localhost:5433/jie_test?schema=public'
npm run db:test:reset
npm run db:test:migrate
npm run db:test:migrate
npm run test:db
npm run cli -- process --config-dir config --limit 1000
```

The first reset verifies every committed migration from an empty database; the
first deploy represents an already-current database, and the repeated deploy
must report no pending migrations. To verify an upgrade specifically from the
Chunk 4 migration state, create a fresh guarded test database, apply migrations
through `20260729190000_collection_source_partial_failures`, then run
`npm run db:test:migrate`. Never point these commands at developer or production
data. The CLI command requires real private `config/*.yaml` files; examples are
not used implicitly.
