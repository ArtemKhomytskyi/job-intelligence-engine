# Local web report and end-to-end pipeline

- **Status:** Implemented; PostgreSQL verification pending
- **Owner:** Project contributors
- **Last updated:** 2026-08-02

## Objective

Deliver the complete local JIE V1 workflow through `npm run cli -- run` and
`npm run cli -- serve`, reusing the existing collection, processing, scoring,
selection, recommendation persistence, and application-status behavior.

## Background

Chunks 0–6 provide independently executable pipeline stages and immutable
recommendation batches, but daily use still requires several commands and has
no human-readable report. Chunk 7 adds one application-level orchestration
service and a local-only server-rendered report without changing the existing
business algorithms.

## Current repository state

The clean baseline is commit `f51c802`, the Chunk 6 implementation. Local
`dev` and `origin/dev` references still point to the older Chunk 4 merge, while
the current baseline contains the subsequent Chunk 5 and Chunk 6 commits. Work
therefore proceeds on dedicated branch `codex/chunk-7-local-web-report` from
the latest available Chunk 6 commit rather than rebasing onto the stale local
`dev` reference.

Existing application services are `CollectionOrchestrator`,
`ProcessCollectedJobs`, and `CreateRecommendations`. Existing PostgreSQL
records already capture collection runs, processing runs, immutable
recommendation batches, current status, and immutable status history.

## Scope

- One reusable full-pipeline application service and process-local active-run
  coordinator.
- CLI `run` with deterministic stage summary and failure codes.
- Application report queries, deterministic filters/sorts, details retrieval,
  automatic VIEWED behavior, explicit status updates, and latest-run summary.
- Prisma report adapter using bounded, relation-inclusive queries.
- Local Node HTTP server, semantic server-rendered HTML, local CSS/JavaScript,
  same-origin mutation checks, security headers, safe external links, error
  pages, health endpoint, and graceful shutdown.
- CLI `serve` bound to `127.0.0.1:3000` by default.
- Unit, HTTP integration, CLI, PostgreSQL, browser, and local end-to-end tests.
- Required product, architecture, configuration, database, CLI, testing, ADR,
  and execution-plan documentation.

## Non-goals

Automatic applications, CV or cover-letter generation, recruiter outreach,
LLM scoring, authentication, accounts, cloud hosting, public deployment,
browser extensions, a public REST API, or a separate frontend toolchain.

## Architectural constraints

The dependency direction remains `interfaces -> application -> domain`, with
infrastructure implementing application-owned ports. Application code does not
import Prisma, HTTP types, environment values, or HTML rendering. Domain code
does not gain presentation concepts. Existing Chunk 0–6 orchestration and
business algorithms are composed rather than copied.

## Affected modules

- `src/application/pipeline`: full-run contracts, orchestration, and active-run
  coordination.
- `src/application/reporting`: report models, validation, sorting, queries,
  status behavior, and repository port.
- `src/infrastructure/persistence`: bounded Prisma reporting adapter.
- `src/infrastructure/web`: HTML escaping/rendering, assets, and local server.
- `src/interfaces/composition`: shared dependency construction for CLI and web.
- `src/interfaces/cli`: `run` and `serve` command parsing/lifecycle/output.

## Interfaces and data contracts

`RunFullPipeline` accepts explicit limits, initiation source, and an abort
signal. It validates configuration before invoking collection, processing, and
recommendation stages in that order and returns their existing summaries.

`RecommendationReportRepository` returns a bounded latest-batch list DTO
without descriptions, a complete detail DTO for one recommendation, and the
latest persisted run summaries. Report use cases validate filter/sort inputs
and provide stable final identifier tie-breaks.

Status updates accept only VIEWED, APPLIED, or SKIPPED from the web interface.
Opening details automatically changes NEW or RECOMMENDED to VIEWED; terminal
APPLIED and SKIPPED states are preserved and repeat reads are idempotent.

## Implementation sequence

1. Add pipeline/report contracts and focused unit tests.
2. Add shared outer composition and CLI `run`.
3. Add bounded Prisma report queries and status use cases.
4. Add HTML renderer, local HTTP adapter, assets, and CLI `serve`.
5. Add HTTP, CLI, database, browser, and full fixture-flow tests.
6. Update documentation and indexes.
7. Run all mandatory verification, perform architecture/correctness/security/
   PostgreSQL/readiness reviews, fix confirmed issues, and rerun verification.

## Error handling

Invalid configuration and request input fail before mutation. Collection keeps
its existing partial-success behavior. A fully failed/cancelled collection is
fatal to downstream stages; partial collection continues. Processing fatal or
cancelled results prevent recommendations. Empty eligible/recommendation sets
are successful. HTTP maps validation to 400, missing records to 404, active-run
conflicts to 409, and unexpected/storage failures to safe 500 pages while logs
retain structured diagnostics without sensitive values.

## Observability considerations

Use stable structured events for pipeline start/stages/completion/failure,
active-run rejection, server start/stop, failed requests, and status updates.
Never log descriptions, profile contents, environment dumps, or database URLs.

## Security and privacy considerations

V1 accepts only the literal loopback host `127.0.0.1`. Mutations use POST and
must match both Host and Origin when Origin is supplied. Responses receive CSP,
frame, MIME-sniffing, referrer, and cache headers. All source text is escaped;
no untrusted `innerHTML` is used. Apply/source URLs are emitted only when they
pass existing public-URL semantics and always use `noopener noreferrer`.
Request bodies are capped and assets have no remote dependencies.

## Testing strategy

Application tests use fakes and cover stage order/failure policies, run
conflicts, every filter/sort, stable ties, details, status idempotency, and
automatic VIEWED protection. HTTP tests use ephemeral ports and cover routes,
headers, mutation protection, escaping, errors, redirects, empty state, and
manual runs. PostgreSQL tests cover complete report queries and immutable
status history. Browser tests use local fixtures only and exercise the daily
flow end to end.

## Documentation updates

Update README, architecture overview, dependency guidance as needed,
configuration, database, CLI usage, testing guides, execution-plan index, and
ADR index. Add `local-web-report.md`, `end-to-end-pipeline.md`, and ADR 0013.

## Acceptance criteria

- [ ] `npm run cli -- run` executes the full deterministic pipeline.
- [ ] `npm run cli -- serve` starts at `http://127.0.0.1:3000` by default.
- [x] Report list, filters, sorts, details, breakdown, status history, manual
      run, latest state, empty/error pages, and safe apply links work.
- [x] VIEWED/APPLIED/SKIPPED persistence and immutable-history behavior are
      implemented; real PostgreSQL execution remains pending.
- [x] CLI and HTTP use the same full-pipeline application service.
- [x] Local binding, same-origin checks, escaping, headers, bounded bodies, and
      safe external links are verified.
- [ ] Required unit, HTTP, CLI, and browser tests pass; PostgreSQL/end-to-end
      execution is pending `TEST_DATABASE_URL`.
- [x] Documentation and final reviews are complete.

## Verification commands

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:coverage
npm.cmd run prisma:validate
npm.cmd run prisma:format
npm.cmd run prisma:generate
npm.cmd run build
npm.cmd run test:browser
npm.cmd run verify
npm.cmd run db:test:migrate
npm.cmd run test:db
npm.cmd run verify:full
npm.cmd run cli -- validate-config --examples
npm.cmd run cli -- run
npm.cmd run cli -- serve
git diff --check
git status --short
```

Also run `docker compose config` because the mandatory repository instructions
require it for persistence-adjacent work. Database commands require a guarded
`TEST_DATABASE_URL` and will remain explicitly pending if it is absent.

## Risks

- A synchronous manual run can take time; the server keeps the operation in an
  awaited promise independent of request disconnect and rejects duplicates.
- A process-local lock does not coordinate two separately launched JIE
  processes. V1 is explicitly single-user/local; document this limitation.
- Existing records do not persist whether loading a historical batch originally
  reused it. The current invocation reports reuse; historical UI labels the
  value unavailable instead of inventing it.
- Description and score payloads are untrusted persisted data; strict mapping,
  escaping, CSP, and public-URL validation reduce exposure.

## Rollback considerations

No existing migration or algorithm is replaced. The new command, report port,
server adapter, and documentation can be removed independently. No destructive
data rollback is planned because the initial design needs no schema change.

## Unresolved questions

- None blocking. A persisted cross-process pipeline lock is deferred unless
  tests or review demonstrate that the permitted V1 in-process lock is
  insufficient.

## Implementation notes

- 2026-08-02: Mandatory repository, branch, migration, architecture,
  configuration, orchestration, persistence, CLI, test-infrastructure, and
  specification inspection completed. Dedicated branch created from clean
  Chunk 6 baseline.
- 2026-08-02: Selected dependency-free `node:http` server-rendered architecture;
  no frontend or server framework dependency is justified.
- 2026-08-02: Implementation completed. Final database-independent suite: 24
  files and 203 tests passed. Browser suite: 2 files and 2 tests passed.
  Coverage: 91.38% statements, 80.41% branches, 94.20% functions, and 92.61%
  lines overall; selected Chunk 7 files: 86.91%, 78.12%, 89.17%, and 88.91%.
- 2026-08-02: Browser review found `Referrer-Policy: no-referrer` caused
  Chromium form POSTs to send `Origin: null`; changed to `same-origin` while
  retaining `noreferrer` on external links. Regression browser test passes.
- 2026-08-02: `npm run verify` and browser verification passed.
  `verify:full` reached and passed those phases, then stopped at guarded
  `db:test:migrate` because `TEST_DATABASE_URL` is unset. Direct port review
  found a listener on localhost:5432, but its test-database identity and
  credentials could not be established safely. Docker CLI is absent. No
  database was modified.
- 2026-08-02: Host runtime is Node 24.18.0/npm 11.16.0, not required Node 22/npm 10. The lockfile was not regenerated or modified.
- 2026-08-02: Manual smoke testing exposed expected collection-stage failures
  reaching the generic 500 mapper. The HTTP boundary now catches only
  `PipelineStageError`, uses a 303 redirect to a safe failure summary, and reads
  the already-persisted latest state for collection counts. The summary marks
  downstream stages as not run even when older downstream records remain.
  Unexpected exceptions retain the generic 500 behavior. HTTP and Playwright
  regressions cover the failure, persisted state, duplicate submissions, and
  information-disclosure boundary.

## Final outcome

Implementation, database-independent verification, Playwright verification,
documentation, and final reviews are complete. Merge approval remains blocked
until the guarded PostgreSQL suite and real CLI smoke workflow run with Node 22
LTS/npm 10, `TEST_DATABASE_URL`, `DATABASE_URL`, and private local configuration.
