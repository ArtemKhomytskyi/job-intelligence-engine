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

`npm run db:down` stops the main service without deleting its named volume. `docker compose down --volumes` destroys local developer data and must be deliberate. Application code provides no hard-delete workflow.

For the isolated test database, follow [database test guidance](../testing/database-tests.md). Local/test passwords in Compose and CI are development-only defaults and must never be reused for production.
