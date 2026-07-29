# 0008: Store current status plus immutable history and test against PostgreSQL

- **Status:** Accepted
- **Date:** 2026-07-29

## Context

Status queries need a current value, while explainability needs history. Prisma mocks or another database cannot verify PostgreSQL constraints and transaction rollback.

## Decision

Store `Job.currentStatus` and append `JobStatusHistory` in one application-owned transaction. Treat same-status writes as idempotent. Verify repositories against an isolated, guarded PostgreSQL 17 test database; keep these tests separate from unit tests and run both in CI.

## Consequences

Current queries remain simple and audit history is durable. Writes must keep two records consistent, so transaction tests are mandatory. Local database tests require Docker or another safe localhost PostgreSQL instance.

## Alternatives considered

- Derive current status from history: rejected because every common query would require latest-row logic.
- Current status only: rejected because it loses explainability.
- Mock Prisma or use SQLite: rejected because neither validates actual PostgreSQL behavior.
