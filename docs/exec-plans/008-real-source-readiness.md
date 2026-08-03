# Real source readiness and first-run setup

- **Status:** Complete; database verification pending environment
- **Owner:** Codex
- **Last updated:** 2026-08-02

## Objective

Prevent tracked placeholder sources from reaching collection while allowing the
local report to start and guide a first-time user through private setup.

## Background

The tracked source examples are documentation fixtures. Copying them unchanged
currently launches doomed network requests and creates a failed collection run.

## Current repository state

Configuration has one validation path, the full pipeline loads configuration
before collection, and serve validates the same runtime configuration before
binding. The report has no source-readiness state or setup route.

## Scope

Deterministic placeholder detection, explicit configuration modes, a read-only
`sources:check` command, pre-collection runtime rejection, and local setup UI.

## Non-goals

Network probing, collector redesign, migration changes, real employer sources,
credentials, or automatic configuration edits.

## Architectural constraints

Readiness classification is pure domain logic. Application validation applies
mode-specific policy. CLI and web interfaces consume these inward-owned results.

## Affected modules

Domain source readiness; application configuration validation; CLI composition
and output; local runtime and report delivery; examples, tests, and docs.

## Interfaces and data contracts

Configuration loading gains runtime, example, and inspection modes. Local web
handler dependencies gain an immutable source-readiness report.

## Implementation sequence

1. Add and test pure source classification.
2. Apply mode-specific validation before any collector is composed.
3. Add `sources:check` without network I/O.
4. Add setup-state rendering and guard the manual run action.
5. Update templates, docs, browser coverage, and verification evidence.

## Error handling

Enabled runtime placeholders produce `PLACEHOLDER_SOURCE_NOT_ALLOWED`.
Inspection mode still reports structural errors. Web setup is a normal 200 page
or 303 redirect, never a generic 500.

## Observability considerations

Blocked manual actions log only a stable readiness event and no source values.

## Security and privacy considerations

Only source IDs, types, enabled state, and classification appear in CLI output.
No credentials, environment data, or private file contents are rendered.

## Testing strategy

Unit classification, configuration-mode integration, full-pipeline short
circuit, CLI readiness, HTTP setup/action guard, serve startup, and Playwright.

## Documentation updates

README, configuration, CLI, local report architecture, source comments, and the
execution-plan index.

## Acceptance criteria

- [x] Runtime placeholders fail before collection persistence.
- [x] Tracked examples validate only through explicit example mode.
- [x] Serve renders setup guidance and cannot launch a doomed run.
- [x] Readiness inspection performs no network requests.
- [x] Required verification is reported exactly.

## Verification commands

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:coverage
npm.cmd run cli -- validate-config --examples
npm.cmd run test:browser
npm.cmd run db:test:migrate
npm.cmd run test:db
npm.cmd run verify:full
npm.cmd run build
git diff --check
```

## Risks

Over-broad classification could reject a legitimate source. Detection is kept
to reserved example domains and explicit placeholder prefixes.

## Rollback considerations

No schema or data change exists. The classifier, modes, command, and setup UI
can be reverted together.

## Unresolved questions

- None.

## Implementation notes

- 2026-08-02: Selected explicit inspection mode for serve so runtime commands
  remain strict without making the local setup UI unavailable.
- 2026-08-02: The current private sources are the old enabled examples.
  `sources:check`, private validation, and `run` now identify them as
  placeholders; the full pipeline logs only the configuration stage and never
  starts collection.
- 2026-08-02: Database-independent suite passed 25 files and 219 tests; browser
  suite passed 2 files and 4 tests. Coverage passed at 91.45% statements,
  80.21% branches, 94.24% functions, and 92.66% lines. Formatting, lint, type
  checking, example validation, Prisma validation/generation, and build passed.
- 2026-08-02: `db:test:migrate`, `test:db`, and therefore the final database
  phase of `verify:full` could not run because `TEST_DATABASE_URL` is unset.
  No migration or database data was changed.

## Final outcome

Placeholder collection is blocked before persistence, tracked examples remain
valid documentation, source readiness is inspectable without network access,
and the local report provides a safe first-run setup flow. Real source smoke
testing remains intentionally pending user-supplied private source values.
