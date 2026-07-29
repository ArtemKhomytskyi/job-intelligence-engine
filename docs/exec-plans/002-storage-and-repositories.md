# Storage and repository layer

- **Status:** Implemented; local database verification blocked
- **Owner:** Project contributors
- **Last updated:** 2026-07-29

## Objective

Add the PostgreSQL and Prisma persistence boundary for jobs, sources, collection runs, scores, recommendations, fingerprints, revisions, and lifecycle status without implementing collectors, normalization, scoring, or recommendation selection.

## Background

Chunk 1 established pure domain contracts and strict configuration loading. Those contracts intentionally contain no database concerns. Chunk 2 needs durable identity and history while preserving the dependency direction `interfaces -> application -> domain`, with Prisma confined to infrastructure.

## Current repository state

Work starts on `feature/chunk-2-storage` from a clean tree. PostgreSQL 17 and Prisma 6.19.3 are already foundation dependencies, but the Prisma schema has no business models, no migration exists, and database tests are not yet part of CI.

## Scope

- Relational Prisma models, constraints, indexes, and an initial storage migration.
- Application-owned persistence DTOs, repository ports, structured errors, and transaction abstraction.
- Prisma client lifecycle, explicit record mapping, repositories, and transaction implementation.
- Exact versioned SHA-256 fingerprints, idempotent job upsert, meaningful revisions, and atomic status history.
- Persistence operations for sources, collection runs, scores/components, and recommendation batches.
- Database health/migration CLI commands, guarded test-database lifecycle, real PostgreSQL integration tests, and CI service configuration.
- Storage, database, test, architecture, contributor, README, and ADR documentation.

## Non-goals

Collectors, HTTP or browser access, normalization algorithms, fuzzy matching, filters, score calculation, recommendation selection, application submission, APIs, UI, authentication, AI, resume processing, multi-user behavior, and cloud deployment.

## Architectural constraints

Domain and application code import no Prisma types. Application owns persistence contracts and transaction boundaries. Infrastructure maps records explicitly and retains database causes behind structured errors. Transactions are bounded to one application operation. Important query and identity fields are relational columns; JSON is reserved for metadata, explanation lists, error summaries, and compact revision snapshots.

## Affected modules

- `prisma`: relational schema and generated initial migration.
- `src/domain`: job lifecycle status and deterministic fingerprint input contract.
- `src/application/persistence`: DTOs, ports, errors, and use-case functions.
- `src/infrastructure/persistence`: Prisma lifecycle, mapping, repositories, health/migration adapters, and transactions.
- `src/interfaces/cli`: database command composition and sanitized output.
- `tests/database`: real PostgreSQL repository and transaction tests.
- `scripts`: guarded test URL and migration/reset lifecycle helpers.

## Interfaces and data contracts

Repository APIs use application DTOs containing strings, numbers, dates, and domain JSON values. `PersistenceTransactionManager.execute` supplies one transaction-scoped repository set. Job upsert returns `CREATED`, `UPDATED`, `UNCHANGED`, `LINKED_TO_EXISTING`, or throws a structured identity conflict. Score and recommendation writes accept already-calculated values; they perform no business calculation.

## Implementation sequence

1. Document the relational model and application persistence contracts.
2. Define the Prisma schema and generate the initial migration.
3. Add client lifecycle, mappings, repositories, transaction manager, and application use cases.
4. Add database CLI and guarded test lifecycle.
5. Add PostgreSQL integration tests and CI database service.
6. Update architecture, operational, contributor, and ADR documentation.
7. Run every required check, inspect the final diff/privacy scope, and record outcomes.

## Error handling

Expected failures use stable persistence codes. Known Prisma availability, constraint, not-found, transaction, and query errors are mapped without exposing connection URLs, raw payloads, or Prisma messages. Causes remain available internally. Mapping rejects invalid record shapes as `DATA_MAPPING_FAILED`.

## Observability considerations

Database CLI output is deterministic and minimal. Health checks report availability without connection strings. No telemetry or logging dependency is introduced.

## Security and privacy considerations

Migrations and fixtures contain synthetic values only. Destructive test commands require `TEST_DATABASE_URL`, validate a localhost host, and require a database name containing `test`. Normal commands never print database URLs. Prisma safe query APIs are used; no unsafe raw SQL is introduced.

## Testing strategy

`npm test` remains database-independent. `npm run test:db` uses a dedicated PostgreSQL database after guarded migration/reset scripts. Database tests clean tables between tests, avoid order dependence, and cover repository identity, history, score, recommendation, collection-run, and rollback behavior. CI runs both suites against a PostgreSQL 17 service.

## Documentation updates

Add storage architecture, database operations, database-test documentation, and consolidated ADRs for the persistence boundary, versioned fingerprints, and current-plus-history/test-database choices. Update README, CONTRIBUTING, AGENTS, architecture overview/dependencies, ADR index, and execution-plan index.

## Acceptance criteria

- [x] Required concepts, relationships, constraints, indexes, and migration exist and validate statically.
- [x] Application-owned ports and Prisma implementations expose no Prisma records or types inward.
- [x] Job upsert, exact matching, references, fingerprints, revisions, and timestamp semantics are implemented deterministically and idempotently.
- [x] Current status and immutable history update in one transaction.
- [x] Scores/components, recommendations, and collection runs have persistence implementations.
- [x] Database commands and destructive test guards are documented; the missing-URL guard was exercised.
- [x] Real PostgreSQL integration tests and CI database verification exist.
- [x] Required documentation and ADRs match the implementation.
- [ ] Migration application and repository behavior pass against a live local PostgreSQL instance; the installed Docker backend cannot start.

## Verification commands

The full command list is the Chunk 2 specification: install/CI install, formatting, lint, typecheck, unit tests, coverage, Prisma format/validate/generate, build, verify, example CLI, dependency tree, audit, diff check, Compose validation, migrations, database CLI, test database lifecycle, database tests, and `verify:full`.

## Risks

- Concurrent identity races: mitigate with database uniqueness and explicit conflict mapping.
- Schema/application drift: mitigate with explicit mapping and integration tests.
- Accidental developer-data deletion: mitigate with a strict test URL guard and separate Compose project/database.
- Large revisions: store selected changed values rather than raw source payloads.

## Rollback considerations

Code changes are additive. A local development database can be removed only through an explicit documented Compose volume reset. Applied migrations are not silently rolled back; reverting the chunk requires a deliberate follow-up migration in any retained database.

## Unresolved questions

- Local Docker availability will be established during verification. If unavailable, Compose will still be validated and every unexecuted database check will be recorded.

## Implementation notes

- 2026-07-29: Confirmed the clean `feature/chunk-2-storage` branch and reviewed Chunk 1 contracts, architecture rules, existing tooling, and the full Chunk 2 specification.
- 2026-07-29: Added the complete relational schema and Prisma-generated `20260729152500_initial_storage` migration, application ports/use cases/errors, versioned fingerprints, Prisma mappings/repositories/transactions, and database CLI commands.
- 2026-07-29: Added an isolated PostgreSQL 17 Compose definition, guarded reset/migration script, six real repository integration scenarios, and CI PostgreSQL service execution through `verify:full`.
- 2026-07-29: `npm run verify` passed with 42 database-independent tests. Coverage passed at 95.25% statements, 81.41% branches, 96.36% functions, and 95.16% lines. `npm audit` reported zero vulnerabilities.
- 2026-07-29: Both Compose files passed configuration rendering through the installed Compose plugin. Docker engine startup failed because Docker Desktop is missing its registry/backend configuration; PostgreSQL could not be reached at ports 5432/5433. Consequently migration deployment, database CLI success paths, six database tests, and `verify:full` could not pass locally. The failure paths were exercised and produced sanitized output.
- 2026-07-29: `npm install` passed with the expected Node-engine warning because the host runs Node 24 rather than declared Node 22. The first sandboxed `npm ci` and Prisma generation attempts were blocked by cache/network permissions; approved reruns succeeded.

## Final outcome

The scoped storage implementation, migration, CLI, documentation, CI service, and real PostgreSQL suite are complete. All database-independent quality checks pass and Compose configuration is valid. Final acceptance still requires running the committed migration and database suite on a working localhost PostgreSQL 17 instance; this workstation's broken Docker backend is the only recorded blocker.
