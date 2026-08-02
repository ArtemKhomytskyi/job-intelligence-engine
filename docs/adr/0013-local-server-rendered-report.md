# ADR 0013: Local server-rendered report

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

JIE V1 needs a daily-use browser report and manual full-pipeline action while
remaining local-first, deterministic, accessible, and independent of a hosted
backend. The repository has no frontend framework or HTTP framework, and the
required interactions are small forms and read-only report pages.

## Decision

Use Node's built-in HTTP server bound only to `127.0.0.1`, server-rendered
escaped HTML, a compact local stylesheet, and minimal progressive-enhancement
JavaScript. Route parsing and response mapping remain in interfaces; HTML and
HTTP lifecycle adapters remain outside application/domain. Application-owned
report and full-pipeline ports keep use cases independently testable.

Both CLI `run` and web `POST /actions/run` receive the same composed
`RunFullPipeline` application service. A process-local coordinator permits one
active run at a time and releases the lock on success or failure. This matches
the single-user V1 deployment model without adding queues or redundant schema.

Opening recommendation details automatically sets NEW or RECOMMENDED jobs to
VIEWED. APPLIED and SKIPPED are never overwritten, and repeated details views
are idempotent.

## Consequences

- No new runtime dependency or frontend build system is required.
- HTML escaping, CSP, security headers, same-origin mutation validation, body
  limits, safe public apply URLs, and loopback-only binding are explicit code
  responsibilities.
- Manual runs are synchronous from the user's perspective, though ordinary
  asynchronous Node I/O remains responsive.
- The active-run lock coordinates one server process, not multiple independent
  CLI/server processes. That is an accepted V1 limitation and is documented.
- Existing immutable collection, processing, score, recommendation, and status
  records remain authoritative; no parallel reporting store is introduced.
