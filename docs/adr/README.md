# Architecture decision records

Architecture decision records (ADRs) capture project-wide choices that affect implementation or contributor workflows. Each record describes its context, decision, consequences, alternatives, and date.

Accepted records remain in place when superseded; a later ADR should link to and replace the earlier decision rather than rewriting history.

- [0001: Use Node.js 22 LTS](0001-node-22-lts.md)
- [0002: Use explicit relative imports](0002-relative-imports.md)
- [0003: Do not use path aliases](0003-no-path-aliases.md)
- [0004: Validate YAML with Zod at the infrastructure boundary](0004-zod-yaml-boundary-validation.md)
- [0005: Keep raw and normalized job stages distinct](0005-distinct-job-stages.md)
- [0006: Keep PostgreSQL and Prisma behind application-owned persistence ports](0006-postgresql-prisma-persistence-boundary.md)
- [0007: Use versioned exact SHA-256 job fingerprints](0007-versioned-exact-job-fingerprints.md)
- [0008: Store current status plus immutable history and test against PostgreSQL](0008-status-history-and-real-database-tests.md)
- [0009: Keep collection contracts and resilience policy inward-owned](0009-application-owned-collection-boundaries.md)
