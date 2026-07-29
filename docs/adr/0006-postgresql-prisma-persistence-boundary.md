# 0006: Keep PostgreSQL and Prisma behind application-owned persistence ports

- **Status:** Accepted
- **Date:** 2026-07-29

## Context

Durable job identity and history need relational constraints and transactions without coupling business contracts to generated database types.

## Decision

Use PostgreSQL 17 with Prisma 6 behind repository and transaction interfaces owned by application. Store query/identity fields relationally and reserve JSONB for metadata, structured lists, errors, and compact snapshots. Map records explicitly at the infrastructure boundary.

## Consequences

Inner layers contain no Prisma types and database constraints reinforce identity. Mapping adds code, and integration tests require PostgreSQL. Tight child records cascade with their owner; source deletion is restricted.

## Alternatives considered

- Prisma records as domain models: rejected because generated enums, Decimal, and lifecycle details would leak inward.
- Document-only storage: rejected because identity, history ordering, ranking, and component queries need relational constraints.
- Generic repository: rejected because it hides use-case semantics and transaction needs.
