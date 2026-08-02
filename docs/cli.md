# Command-line interface

The canonical Windows examples use `npm.cmd`; `npm` is equivalent elsewhere.

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
is successful.

## Local report

```powershell
npm.cmd run cli -- serve
```

Startup prints `JIE local report available at http://127.0.0.1:3000`.
`--host` and `--port` override defaults, but V1 accepts only `127.0.0.1`; ports
must be 1–65535. `--concurrency` and `--processing-limit` configure manual web
runs. Configuration and database connectivity are checked before binding.
Ctrl+C/SIGTERM shuts down cleanly.
