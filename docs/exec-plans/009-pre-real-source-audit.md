# Pre-real-source audit

## Status

Complete. This plan governed a pre-production, pre-real-source audit; it was not
a feature chunk and did not authorize contacting real career sites. The final
status is `NOT READY` because open HIGH DNS/browser resource risks remain.

## Objective

Determine whether JIE is safe, correct, deterministic, operable, and
documented well enough for a small controlled pilot using user-owned private
source configuration. Confirmed defects may be fixed only after this plan and
the initial risk register exist, with a failing regression test first and the
smallest change that preserves the current product scope.

## Scope

- Clean Architecture dependency direction and composition boundaries.
- Configuration and source-readiness behavior, including placeholder safety.
- Greenhouse, Lever, JSON-LD, semantic HTML, and Playwright contracts.
- SSRF, redirects, DNS resolution, response bounds, browser isolation, local
  web security, output encoding, request integrity, secrets, and privacy.
- Normalization, deduplication, filters, scoring, selection, idempotency, and
  user-visible pipeline state.
- Prisma/PostgreSQL schema, migrations, transactions, constraints, indexes,
  query bounds, and guarded database-test workflow.
- Unit, integration, browser, database, coverage, CI, dependency, build, and
  onboarding evidence.

Excluded: real third-party crawling, authenticated sources, CAPTCHA bypass,
new collectors, hosted services, accounts, automatic applications, and broad
refactors.

## Safety constraints

All dynamic collector checks use existing synthetic fixtures, injected
transports, loopback fixture servers, or a disposable guarded PostgreSQL test
database. Private YAML, `.env` values, credentials, raw environment data, and
local persisted user records must not be printed or copied into audit output.

## Evidence phases

1. Inventory the repository, instructions, architecture, configuration,
   migrations, runtime composition, tests, CI, lockfile, and local toolchain.
2. Compare security and collector contracts with current primary official
   documentation from OWASP, Node.js, PostgreSQL, Prisma, Playwright,
   Greenhouse, Lever, Google, GitHub, npm, and TypeScript.
3. Run static checks for dependency direction, unsafe APIs, secret/privacy
   exposure, unbounded inputs, migration drift, and supply-chain controls.
4. Run dynamic fixture-only tests for URL handling, redirects, response
   limits, extraction, browser isolation, web mutations, pipeline failures,
   idempotency, persistence, and performance bounds.
5. For each confirmed defect, record evidence and severity, add a failing
   regression test, apply a narrow fix, and rerun proportionate checks.
6. Execute the complete verification matrix, finalize the 27-section audit
   report, close or explicitly retain each risk, and apply the readiness gates.

## Required verification matrix

- `npm.cmd run format:check`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd test`
- `npm.cmd run test:coverage`
- `npm.cmd run prisma:validate`
- `npm.cmd run prisma:format`
- `npm.cmd run prisma:generate`
- `npm.cmd run build`
- `npm.cmd run test:browser`
- `npm.cmd run db:test:migrate`
- `npm.cmd run test:db`
- `npm.cmd run verify`
- `npm.cmd run verify:full`
- `npm.cmd run cli -- validate-config --examples`
- `npm.cmd run cli -- sources:check --examples`
- `npm.cmd audit`
- `npm.cmd outdated`
- `npm.cmd ls --all`
- `git diff --check`

When a disposable guarded database is available, also run migration status and
deploy checks against it. Every command, exit code, test count, failure cause,
and environment limitation is recorded in the audit report.

## Readiness decision

The final status is `READY FOR CONTROLLED REAL-SOURCE PILOT` only when all
blocking gates pass, no open HIGH risk remains, the full database and browser
paths have executed successfully, and limitations have safe pilot controls.
Otherwise the status is `NOT READY`.

## Rollback and recovery

Audit documentation is additive. Code fixes must be independently reviewable
and revertible. No migration rollback is attempted; any schema correction
requires a forward migration and guarded database verification. A disposable
audit database may be removed only after its exact localhost/test-marked name
has been verified.

## Progress log

- 2026-08-03: Completed the initial read-only repository inventory and primary
  documentation research. Created this plan, the report scaffold, and the
  preliminary risk register before any production-code modification.
- 2026-08-03: Reproduced confirmed defects with synthetic regressions, applied
  narrow fixes, and completed static, ordinary, coverage, browser, guarded
  PostgreSQL, CLI, dependency, and aggregate verification.
- 2026-08-03: Finalized the 27-section report and risk register. All executable
  suites pass, but connection-time DNS enforcement and a pre-load Chromium
  resource bound are required before any real-source pilot.
