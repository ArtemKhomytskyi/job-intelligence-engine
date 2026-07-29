# Collection framework and initial ATS collectors

- **Status:** Complete (database execution pending CI/local PostgreSQL)
- **Owner:** Project contributors
- **Last updated:** 2026-07-29

## Objective

Implement the first complete product path: load configured public Greenhouse and Lever sources, collect and validate ATS responses through a shared resilient HTTP boundary, perform deterministic basic normalization, persist jobs through Chunk 2, isolate source/job failures, record collection statistics, and expose `npm run cli -- collect`.

## Background

Chunk 1 supplies strict source configuration and job-stage contracts. Chunk 2 supplies canonical job identity, source references, exact fingerprints, revisions, collection runs, repository ports, and transaction-scoped upsert services. Chunk 3 must compose those capabilities without adding filtering, scoring, recommendation selection, browser automation, or application submission.

## Current repository state

The requested `feature/chunk-3-collection` branch was initially clean but based on Chunk 1 rather than the required Chunk 2 commit. The committed `feature/chunk-2-storage` change `c9c1e29` was inspected and restored verbatim by cherry-pick as `0bff69a`. The working tree is clean at plan creation. Local Docker remains known to be installed without a functioning backend; CI PostgreSQL is authoritative for database verification if that condition persists.

## Scope

- Application-owned collection contracts, collector/HTTP/logger/persistence ports, registry, structured errors, bounded concurrency, and orchestration.
- Node built-in fetch adapter with finite timeouts, abort propagation, bounded response size, error classification, retries, and per-source minimum-interval rate limiting.
- Public unauthenticated Greenhouse and Lever API collectors with Zod response validation.
- Deterministic plain-text description conversion, conservative URL validation, and non-inferential basic normalization.
- Existing Chunk 2 job/source/run persistence composition and exact upsert outcome aggregation.
- Collection CLI, structured summary rendering, signal cancellation, fixtures, unit tests, PostgreSQL vertical tests, CI/docs/ADRs.

## Non-goals

LinkedIn/Indeed/Glassdoor, HTML scraping, Playwright/browser automation, private endpoints or credentials, semantic/fuzzy normalization, filtering, scoring, recommendation generation, AI, geocoding, salary inference, scheduling/daemon behavior, APIs, UI, and automatic application.

## Architectural constraints

Dependencies remain `interfaces -> application -> domain`; infrastructure implements inward-owned ports. Collectors receive source-independent application contracts and never import Prisma, print output, or persist directly. Native `Response` and ATS payload types remain in infrastructure. The orchestrator receives explicit dependencies, uses bounded per-source work, and persists each job through the existing Chunk 2 upsert service rather than holding a run-wide transaction.

## Affected modules

- `src/domain/source-config.ts`: only the collection controls required by real Greenhouse/Lever sources.
- `src/application/collection`: contracts, ports, errors, registry, normalization, orchestration, and persistence composition.
- `src/infrastructure/http`: fetch, retry, rate limiting, and abort-aware delay.
- `src/infrastructure/collectors`: Zod payload schemas and Greenhouse/Lever adapters.
- `src/infrastructure/logging`: concrete structured logger.
- `src/interfaces/cli`: collect parsing, composition, cancellation, and rendering.
- `tests/fixtures`, `tests/unit/collection`, and `tests/database`: controlled payloads and vertical behavior.
- Docs, ADR index, configuration examples, and CI/test guidance.

## Interfaces and data contracts

`JobCollector.collect` accepts a `CollectableSource` plus collection timestamp/signal and returns validated `NormalizedJobPosting` candidates, per-job invalid counts, warnings, request count, and raw count. `HttpClient.getJson` accepts an application `JsonDecoder<T>` so decoded JSON never crosses the boundary unvalidated. `CollectionPersistence` is a narrow application port implemented by composition over existing Chunk 2 use cases. Summaries retain created, updated, unchanged, linked, invalid, and persistence-failure counts separately.

## Implementation sequence

1. Add collection contracts/errors/ports/registry and minimal source configuration fields.
2. Add deterministic normalization, URL, and description behavior.
3. Implement fetch timeout/error mapping, retry, rate limiting, and logger adapters.
4. Implement Greenhouse and Lever schemas/collectors and focused fixtures.
5. Implement bounded orchestration over existing persistence services.
6. Add CLI composition/rendering/cancellation.
7. Add unit and PostgreSQL vertical tests.
8. Update schema only for the identified source-result partial status/failure counter gap, with migration and docs.
9. Update architecture/collector/test documentation and ADRs.
10. Run the full verification matrix and record all blocked database checks honestly.

## Error handling

Collection errors use stable categories, retryability, optional safe source/status/attempt/endpoint context, and retained causes. HTTP errors omit query strings, headers, and bodies. Malformed individual jobs increment invalid counts; malformed top-level responses fail only their source. Per-job persistence failures increment a separate counter while later jobs and sources continue.

## Observability considerations

Application and collectors use a small structured logger port. The console adapter writes structured fields only when verbose mode is enabled. CLI summaries remain separate, deterministic, and JSON-safe. Descriptions, payloads, credentials, and complete query strings are never logged.

## Security and privacy considerations

Only fixed public ATS endpoint templates based on validated board/site identifiers are supported. HTTPS is mandatory outside loopback tests. Redirect results are protocol-checked, response size is bounded, retries/timeouts/concurrency are finite, and no credentials/cookies/tokens are accepted. Fixtures are handcrafted and fictional.

## Testing strategy

Unit tests use fake transports, clocks/sleepers, collectors, persistence, and loggers with no live network or real delays. Collector fixtures cover normal/empty/missing/malformed/invalid payloads. Database tests reuse the guarded `TEST_DATABASE_URL`, real migrations/repositories/upsert/orchestrator, and fake/local HTTP only. CI continues to run `verify:full` against PostgreSQL 17.

## Documentation updates

Add collection architecture, collector overview and per-ATS guides, collector-test guidance, and consolidated ADRs. Update README, AGENTS, CONTRIBUTING, architecture/dependency/storage/database/configuration docs, execution-plan index, and example source controls.

## Acceptance criteria

- [x] Collector contract/registry resolve Greenhouse and Lever without concrete dependencies in orchestration.
- [x] HTTP timeout, cancellation, retry classification, and per-source rate limiting are bounded and tested.
- [x] Both fixture-backed collectors validate top-level responses, skip malformed items, and normalize required fields.
- [x] Orchestration isolates source/job/persistence failures and returns deterministic counters/status/order.
- [x] Existing Chunk 2 upsert/source/run services are reused; no duplicate identity or revision logic exists.
- [x] `npm run cli -- collect` supports documented selection/concurrency/verbose/JSON behavior and clean shutdown.
- [x] Real PostgreSQL vertical tests and CI coverage exist without live ATS traffic.
- [x] Documentation, ADRs, privacy, and scope checks are complete.
- [x] All executable required verification passes; unavailable Docker/PostgreSQL checks are identified.

## Verification commands

Run the complete Chunk 3 command matrix: install/CI install, format/lint/typecheck/unit/coverage/Prisma/build/verify/example CLI/dependency/audit/diff checks; both Compose configurations; migration, database CLI, guarded database lifecycle/tests/`verify:full`; focused Greenhouse, Lever, HTTP, orchestrator, and vertical collection tests. Automated tests must contact no public ATS endpoint.

## Risks

- ATS response drift: strict top-level and per-item schemas fail safely and fixtures document the supported subset.
- Retry/rate-limit flakiness: inject delay/clock behavior and avoid real unit-test waits.
- Over-normalization: preserve explicit source values and metadata; do not infer semantic fields.
- Persistence mismatch: reuse Chunk 2 services and add only a source-result partial status/failure counter migration.
- SSRF/data leakage: construct fixed endpoints from safe identifiers and sanitize all errors/logs.

## Rollback considerations

Collection code/config/docs are additive. The source-result enum/column migration is forward-only for retained databases; rollback would require a deliberate follow-up migration. No collector stores credentials or creates external state beyond public GET requests and local persistence.

## Unresolved questions

- Whether local PostgreSQL can be made available remains an environment question; implementation does not depend on it, and CI remains authoritative.

## Implementation notes

- 2026-07-29: Confirmed the requested branch and clean working tree, discovered it omitted committed Chunk 2, inspected the storage commit, and restored it verbatim as prerequisite commit `0bff69a`.
- 2026-07-29: Chose fixed public ATS endpoint templates, plain-text descriptions, three total HTTP attempts, per-source serialized minimum intervals, source concurrency 3, and sequential per-job persistence.
- 2026-07-29: Identified one minimal Chunk 2 extension: `CollectionRunSourceResult` needs `PARTIALLY_FAILED` and `failedCount` to persist Chunk 3 semantics without overloading invalid counts.

## Final outcome

Implemented application-owned collection contracts, registry, conservative normalization, bounded orchestration, Fetch timeout/retry/rate-limit adapters, Greenhouse and Lever collectors, structured logging, CLI composition, and existing Chunk 2 persistence reuse. Added a minimal migrated source-result partial-failure status and counter, synthetic fixtures, unit/orchestration/HTTP/renderer tests, and a real-repository vertical test. Database-independent verification and coverage gates pass; coverage is 92.89% statements, 80.10% branches, 96.94% functions, and 93.13% lines. npm audit reports zero vulnerabilities. Docker is not installed in this environment, the configured PostgreSQL endpoint is unavailable, and `TEST_DATABASE_URL` is unset, so Compose rendering/lifecycle, migrations, database health, the database test, and `verify:full` could not complete locally; CI retains PostgreSQL 17 and `verify:full` as the authoritative execution path.
