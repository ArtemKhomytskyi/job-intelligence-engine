# Normalization, deduplication, and hard filters

- **Status:** Implemented; PostgreSQL verification blocked locally
- **Owner:** Project contributors
- **Last updated:** 2026-07-30

## Objective

Add a deterministic, versioned processing stage that enriches stored collected jobs, classifies duplicates conservatively, evaluates every configured hard filter, persists full decision provenance, and exposes a local `process` CLI summary without adding scoring or recommendation behavior.

## Repository state and conflicts

Chunk 4 is present only as uncommitted work on `feature/chunk-4-generic-web-extraction`; it is treated as the immutable baseline and will not be reset or overwritten. Contrary to the prompt's conceptual “raw job persistence” pipeline, the existing collectors already perform basic normalization and persist directly into `Job`; raw payloads are deliberately not stored (ADR 0005/0006 and storage documentation). Chunk 5 therefore processes current `Job` snapshots and their latest `JobRevision` number. Revision zero represents the initial persisted observation. This avoids inventing source payload recovery or replacing established identity/upsert behavior.

Existing persistence already resolves source/external ID, source URL, canonical URL, and exact v1 fingerprint identity before a second `Job` exists. Chunk 5 will reuse that behavior, record canonical-application-URL duplicates among remaining records, and classify matching company/title/location keys conservatively as `POSSIBLE_DUPLICATE`. It will never delete or silently merge records.

## Design

- Pure domain normalizers derive stable title/company/location keys, seniority, remote scope, explicit experience/education/language/skill/authorization evidence, salary metadata, and structured issues.
- A pure hard-filter chain evaluates country, authorization, mandatory languages, maximum seniority/experience, mandatory PhD, excluded companies/industries/title phrases, and expiry in fixed order.
- The application use case loads a bounded deterministic batch, normalizes outside transactions, evaluates duplicate evidence against the batch, runs filters for unique and possible-duplicate jobs, and atomically persists one job decision at a time.
- Possible duplicates remain filterable and retained for later scoring policy. Confirmed duplicates skip filters and scoring eligibility.
- Processing versions are single constants. Idempotency key: job ID + latest revision number + normalization version + fingerprint version + filter version + configuration fingerprint.
- Current queryable normalized fields remain on `Job`; immutable processing history and evidence live in `JobProcessingDecision`. `JobProcessingRun` stores aggregate results.
- Configuration fingerprint uses canonical fixed-order JSON-compatible input and SHA-256. Changing relevant candidate/filter configuration creates a new decision; unchanged input is skipped.

## Persistence and indexes

Add processing run and decision tables. Decisions link to the input job, optional primary duplicate, and run; store normalized/filter/duplicate status in relational columns and evidence/issues/reasons as JSON. Unique idempotency and indexes cover the decision key, status, primary relationship, and processing run. `Job` gains normalized location key, normalization version/time, and structured current normalization fields needed by later scoring.

## Configuration

Extend search preferences with a strict `hardFilters` object. Defaults preserve current behavior where possible: unknown location/industry/language levels do not reject, possible duplicates remain retained, and only explicit requirements reject. Example configuration stays synthetic. Excluded title entries are safe literal phrases, not user regex, avoiding runtime regex risk.

## Testing

Use synthetic golden cases for title false positives, remote restrictions, experience/PhD/language requirements, skill boundaries, URL normalization, duplicate strength, all filter reasons, multiple simultaneous reasons, expiry equality, idempotency, changed configuration, bounded 1,000-record processing, CLI output, and real PostgreSQL persistence when available.

## Verification

Run formatting, lint, typecheck, unit/integration tests, coverage, build, Prisma validation/generation, example configuration validation, browser regression, migration/real database tests, Compose validation, diff/security/architecture searches, and a 1,000-record deterministic performance test. Report Docker/PostgreSQL blockers honestly.

## Implementation sequence

1. Record architecture decision and define domain/configuration contracts.
2. Implement pure normalization, duplicate, and hard-filter policies with unit tests.
3. Add Prisma schema/migration and application-owned processing ports.
4. Implement Prisma adapters and processing orchestration.
5. Add CLI composition and output.
6. Add pipeline/database/performance tests and documentation.
7. Run reviews and complete verification/outcome.

## Final outcome

Implemented the versioned processing domain, bounded O(n * 20) conservative duplicate classification, all ten hard filters, configuration defaults/example, Prisma migration/repositories, transactional orchestration, structured logging, bounded CLI, golden/pipeline/1,000-record/database tests, and documentation. The post-implementation review added fingerprint-version idempotency, concurrency-safe immutable decision insertion, bounded multi-candidate evidence, batch decision lookup, stale-field clearing, run failure/cancellation completion, shared URL semantics, and normalization/filter regressions. Docker/PostgreSQL verification remains explicitly unverified until the commands in the Verification section actually pass in the review environment.
