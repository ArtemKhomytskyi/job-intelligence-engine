# Command-line interface

The canonical Windows examples use `npm.cmd`; `npm` is equivalent elsewhere.

## Source readiness

```powershell
npm.cmd run cli -- sources:check
```

This reports every configured source ID, type, enabled/disabled state,
placeholder/real classification, and readiness without performing network
requests. Exit code 0 means a real source is enabled, 1 means setup is
incomplete, and 2 means configuration could not be inspected. `--examples`
inspects the tracked documentation templates.

Replace template URLs and Greenhouse board tokens or Lever company slugs before
enabling them, then run `npm.cmd run cli -- validate-config`.

## Full daily pipeline

```powershell
npm.cmd run cli -- run
```

This validates configuration, collects and persists jobs, processes current
jobs, scores/selects recommendations, persists an immutable batch, and prints a
deterministic summary. Options include:

```powershell
npm.cmd run cli -- run --config-dir config --concurrency 3 --processing-limit 1000 --limit 20 --json
```

`--limit` overrides the configured daily recommendation limit. Collection
partial failures continue. Invalid configuration exits 2, database/unexpected
fatal failures exit 3, and fatal/cancelled pipeline stages exit 4. Empty output
is successful. Enabled placeholders fail with
`PLACEHOLDER_SOURCE_NOT_ALLOWED` before a CollectionRun is created.

## Local report

```powershell
npm.cmd run cli -- serve
```

Startup prints `JIE local report available at http://127.0.0.1:3000`.
`--host` and `--port` override defaults, but V1 accepts only `127.0.0.1`; ports
must be 1–65535. `--concurrency` and `--processing-limit` configure manual web
runs. Configuration structure and database connectivity are checked before
binding. The server may start without a real enabled source so `/setup` can
explain the private files and commands. In that state Run Pipeline is replaced
with a setup link and direct POST attempts redirect safely. Ctrl+C/SIGTERM shuts
down cleanly.
