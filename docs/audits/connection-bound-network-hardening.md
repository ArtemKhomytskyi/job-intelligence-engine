# Connection-bound network hardening report

## 1. Executive summary

The blocking HTTP DNS TOCTOU defect is fixed. Every runtime HTTP(S) request now
resolves, validates, selects, and connects to one policy-approved address in a
single connection policy. External Chromium fallback is rejected before launch,
so its unresolved connection and pre-load byte-budget limitations are not part
of the controlled pilot. No real source was enabled or contacted.

## 2. Branch and environment

- Branch: `fix/chunk-7-real-source-setup`; starting commit: `e85ae5a`.
- Host: Windows PowerShell with local PostgreSQL `jie_test` on loopback.
- Declared verification runtime: Node `v22.23.0`, npm `10.9.4`.
- The disposable npm 10 `npm ci` preserved the SHA-256 of `package-lock.json`.
- Docker and `psql` remain unavailable; Prisma and guarded DB suites verified
  the existing four migrations without a schema change.

## 3. Chosen DNS-binding design

JIE now uses Node's standard `http.request`/`https.request` with a per-request
custom lookup. An injected resolver normalizes and deduplicates every IPv4/IPv6
answer, rejects the hostname if **any** answer is forbidden, sorts allowed
answers deterministically, and selects the first. The socket lookup can return
only that validated address. This design was selected over an Undici dispatcher
because it avoids pooling, proxy, automatic decompression, dependency, and
portable typing complexity. The alternatives and trade-offs are recorded in
[plan 010](../exec-plans/010-connection-bound-network-hardening.md).

## 4. HTTP connection behavior

The URL retains its original normalized hostname; it is never rewritten to an
IP. Each request disables agent reuse and does not interpret environment proxy
variables. Resolver and transport boundaries are injectable. `Accept-Encoding:
identity` is mandatory and encoded responses fail safely because bounded
decompression is not implemented. Streaming counts bytes, treats
`Content-Length` as advisory, cancels immediately on overflow, and shares one
deadline across connection and body consumption. Existing cancellation, retry,
rate-limit, and safe collection-failure semantics remain.

## 5. TLS and SNI behavior

HTTPS uses the original DNS hostname for request authority, Host, TLS
`servername`, certificate identity verification, and SNI while the socket uses
the selected validated address. Production never sets
`rejectUnauthorized: false`. A synthetic local CA/certificate test proves the
correct hostname succeeds and a hostname mismatch fails.

## 6. Redirect behavior

Automatic redirects remain disabled. Every redirect is parsed, resolved,
all-address validated, deterministically selected, and connection-bound as a
new hop. Redirect loops, limits, missing locations, forbidden destinations, and
private targets retain explicit safe failures. Retries repeat resolution and
policy evaluation, so a later private answer is rejected before transport.

## 7. Browser fallback policy

Enabled external generic page/list sources with browser fallback are rejected
during runtime configuration with `BROWSER_FALLBACK_EXTERNAL_UNSAFE` before a
collection run exists. Readiness reports the same exact blocker. The renderer
also rejects external URLs before browser launch with
`BROWSER_FALLBACK_NOT_PERMITTED`, preventing manual composition from bypassing
configuration. Browser fallback remains available only for explicit HTTP
loopback fixtures when test-loopback mode is injected.

## 8. Browser resource policy

Loopback fixture contexts are isolated and non-persistent. Service workers,
WebSockets, downloads, permissions, unsupported methods, heavy resources, and
child frames are blocked. Requests and popups are bounded; navigation, context,
and cleanup deadlines remain hard limits. External main-document
pre-consumption byte enforcement is not claimed: external browser execution is
prohibited until a connection-bound interception design can enforce it.

## 9. Source readiness changes

- Greenhouse public Job Board API: eligible through hardened HTTP.
- Lever global public Postings API: eligible through hardened HTTP, with PRS-006
  limitations; not recommended as the first pilot source.
- Generic page/list with fallback false or omitted: eligible through hardened
  HTTP only.
- External generic page/list with fallback true: rejected with a stable code.
- Explicit loopback browser fixtures: test-only.

Examples now set fallback false. `sources:check` explains blockers without
network access, and the setup/readiness page gives the same actionable policy.

## 10. Security findings resolved

- **PRS-002:** fixed for runtime HTTP traffic by binding actual sockets to the
  conservatively validated address on every request, redirect, and retry.
- **PRS-003:** controlled-pilot exposure eliminated. External Chromium fallback
  is rejected at configuration, readiness, and renderer boundaries.
- **PRS-020:** controlled-pilot exposure eliminated. External Chromium cannot
  consume a main document; production browser extraction remains deferred.

## 11. Remaining risks

- PRS-006: global Lever lacks EU and explicit pagination support. Pilot starts
  with one Greenhouse board.
- PRS-013: broader Read Committed upsert/revision races remain unproven. Pilot is
  single-run.
- PRS-014: some invariants remain application-enforced. Pilot is local and
  single-writer.
- PRS-021: configuration cardinality relies on private operator control.
- External browser extraction remains unavailable, not production-safe.

## 12. Files added

- `docs/audits/connection-bound-network-hardening.md`
- `docs/audits/pre-real-source-audit.md`
- `docs/audits/pre-real-source-risk-register.md`
- `docs/exec-plans/009-pre-real-source-audit.md`
- `docs/exec-plans/010-connection-bound-network-hardening.md`
- `src/infrastructure/http/node-connection-bound-transport.ts`
- `tests/fixtures/tls/README.md`
- `tests/fixtures/tls/fixture.synthetic.test-cert.pem`
- `tests/fixtures/tls/fixture.synthetic.test-key.pem`
- `tests/unit/connection-bound-network.test.ts`

The PEM private key is deliberately public, synthetic, test-only material and
protects no system or identity.

## 13. Files modified

- `.github/workflows/ci.yml`
- `config/profile.example.yaml`
- `config/sources.example.yaml`
- `docs/architecture/collection.md`
- `docs/architecture/generic-web-extraction.md`
- `docs/cli.md`
- `docs/collectors/README.md`
- `docs/collectors/generic-web.md`
- `docs/configuration/README.md`
- `docs/exec-plans/001-domain-model-and-configuration.md`
- `docs/exec-plans/README.md`
- `docs/testing/browser-tests.md`
- `docs/testing/generic-real-site-review.md`
- `src/application/collection/errors.ts`
- `src/application/collection/source-mapper.ts`
- `src/application/configuration/errors.ts`
- `src/application/configuration/validate-configuration.ts`
- `src/domain/source-readiness.ts`
- `src/infrastructure/browser/playwright-browser-renderer.ts`
- `src/infrastructure/extraction/cheerio-document-extractor.ts`
- `src/infrastructure/http/node-fetch-http-client.ts`
- `src/infrastructure/http/public-url-safety-validator.ts`
- `src/infrastructure/http/retrying-http-client.ts`
- `src/infrastructure/index.ts`
- `src/infrastructure/persistence/recommendation-report-repository.ts`
- `src/infrastructure/persistence/repositories.ts`
- `src/infrastructure/web/html-renderer.ts`
- `src/interfaces/cli/collect-command.ts`
- `src/interfaces/cli/output.ts`
- `src/interfaces/cli/sources-check-command.ts`
- `src/interfaces/composition/local-runtime.ts`
- `src/interfaces/web/local-report-handler.ts`
- `tests/browser/local-report.test.ts`
- `tests/browser/playwright-generic-extraction.test.ts`
- `tests/database/repositories.test.ts`
- `tests/helpers/fixture-site-server.ts`
- `tests/integration/cli-behavior.test.ts`
- `tests/integration/cli.test.ts`
- `tests/integration/configuration-loading.test.ts`
- `tests/integration/generic-http-extraction.test.ts`
- `tests/integration/local-report-http.test.ts`
- `tests/unit/cli-output.test.ts`
- `tests/unit/collection-core.test.ts`
- `tests/unit/configuration-schemas.test.ts`
- `tests/unit/full-pipeline.test.ts`
- `tests/unit/generic-extraction.test.ts`
- `tests/unit/http-clients.test.ts`
- `tests/unit/source-readiness.test.ts`

This list includes the uncommitted prerequisite audit corrections present in
the working tree and preserved by this pass.

## 14. Tests added

The focused matrix covers all-address selection, mixed public/private and
IPv4/IPv6 answers, mapped IPv6, uppercase/trailing-dot hosts, resolver failure
and empty results, one-resolution socket binding, DNS change across retries,
private redirects, host changes, pinned-lookup non-reuse, Host/SNI/TLS identity,
stream overflow, slow bodies, unsupported compression, runtime/readiness codes,
pre-collection rejection, CLI/web behavior, and loopback-only browser launch.
The separate targeted command passes 97 tests across 8 files.

## 15. Commands executed

Final exit codes are shown; expected safety exits are distinguished from test
failures. Database URL assignments are intentionally omitted.

| Command                                                                                   | Exit | Result                                                   |
| ----------------------------------------------------------------------------------------- | ---: | -------------------------------------------------------- |
| `git branch --show-current` / `git status` / `git diff --check` / `git log --oneline -10` |    0 | Preparation completed                                    |
| private `sources:check`                                                                   |    1 | Expected: no enabled real source; no network request     |
| Node 22/npm 10 `npm ci`                                                                   |    0 | 216 packages; lockfile hash unchanged; 0 vulnerabilities |
| `npm.cmd run format:check`                                                                |    0 | Passed final rerun                                       |
| `npm.cmd run lint`                                                                        |    0 | Passed final rerun                                       |
| `npm.cmd run typecheck`                                                                   |    0 | Passed final rerun                                       |
| `npm.cmd test`                                                                            |    0 | 246/246                                                  |
| focused 8-file security matrix                                                            |    0 | 97/97                                                    |
| `npm.cmd run test:coverage`                                                               |    0 | Thresholds passed                                        |
| `npm.cmd run prisma:validate`                                                             |    0 | Schema valid                                             |
| `npm.cmd run prisma:format`                                                               |    0 | Schema formatted/no material change                      |
| `npm.cmd run prisma:generate`                                                             |    0 | Prisma Client 6.19.3 generated                           |
| `npm.cmd run build`                                                                       |    0 | Clean TypeScript build                                   |
| `npm.cmd run test:browser`                                                                |    0 | 6/6                                                      |
| `npm.cmd run db:test:migrate`                                                             |    0 | Four migrations current                                  |
| `npm.cmd run test:db`                                                                     |    0 | 18/18                                                    |
| `npm.cmd run verify`                                                                      |    0 | Standard aggregate passed                                |
| Node 22/npm 10 `npm.cmd run verify:full`                                                  |    0 | All aggregate gates passed                               |
| `npm.cmd run cli -- validate-config --examples`                                           |    0 | Valid, zero enabled sources                              |
| `npm.cmd run cli -- sources:check --examples`                                             |    1 | Expected placeholder safety result; no network request   |
| `npm.cmd audit`                                                                           |    0 | Zero vulnerabilities                                     |
| `git diff --check`                                                                        |    0 | No whitespace errors                                     |

Pre-fix regressions intentionally failed for accepted external browser fallback
and incorrect readiness. During iteration, one popup budget test and one stale
browser-copy assertion failed and were corrected. Immediately after clean
install, Prisma-dependent lint/typecheck initially failed because the generated
client was absent; `prisma:generate` restored the pinned generated client and
all final gates passed.

## 16. Test counts

| Category                        | Files | Tests | Result |
| ------------------------------- | ----: | ----: | ------ |
| Ordinary unit/integration/smoke |    26 |   246 | PASS   |
| Targeted security subset        |     8 |    96 | PASS   |
| Browser                         |     2 |     6 | PASS   |
| Guarded PostgreSQL              |     1 |    18 | PASS   |
| Categorical final aggregate     |    29 |   270 | PASS   |

The targeted set overlaps the ordinary suite; 270 is the ordinary, browser,
and database categorical total, not a count of every repeated execution.

## 17. Coverage

Coverage passed: statements 91.87% (2353/2561), branches 81.11% (1885/2324),
functions 94.81% (567/598), and lines 93.00% (2221/2388).

## 18. Node 22/npm 10 evidence

Disposable cached runtimes reported Node `v22.23.0` and npm `10.9.4`. A clean
`npm ci` installed 216 packages, found zero vulnerabilities, and left the
lockfile SHA-256 unchanged. The complete `verify:full` command then passed under
those same versions, including browser, migration, and database suites. PRS-012
is closed.

## 19. Risk-register changes

PRS-002 is fixed for HTTP. PRS-003 and PRS-020 are explicitly retained as
deferred external-browser capabilities but no longer block the restricted pilot
because browser fallback is prohibited at three boundaries. PRS-012 is fixed by
declared-runtime evidence. PRS-006, PRS-013, PRS-014, and PRS-021 retain narrow
pilot controls rather than speculative fixes.

## 20. Readiness gates

| Gate                                                                     | Result |
| ------------------------------------------------------------------------ | ------ |
| Connection-bound address on every HTTP request/hop/retry                 | PASS   |
| Conservative all-address policy and explicit IPv4/IPv6 handling          | PASS   |
| Original-host TLS certificate, SNI, and Host behavior                    | PASS   |
| External browser launch impossible through supported runtime paths       | PASS   |
| Redirect, byte, timeout, cancellation, retry, and rate-limit semantics   | PASS   |
| Stable safe configuration/readiness/collection errors                    | PASS   |
| Targeted security, ordinary, browser, DB, coverage, and aggregate suites | PASS   |
| Node 22/npm 10 reproducibility                                           | PASS   |
| No new HIGH finding in controlled-pilot exposure                         | PASS   |

## 21. Final status

`Pre-real-source hardening status: READY FOR CONTROLLED HTTP-ONLY PILOT`

This is not a production-readiness claim and does not authorize external
browser extraction.

## 22. Controlled pilot restrictions

Start with exactly one public global Greenhouse board, one active pipeline run,
and one local database writer. Keep `allowBrowserFallback: false`; generic
sources, if later reviewed, are HTTP-only. Do not use Lever EU, authenticated
sites, CAPTCHA/login flows, browser scraping, proxies, stealth, or application
submission. Back up local data, run `sources:check`, use low rates and bounded
runs, inspect the persisted run and job quality after the first collection, and
stop on any policy, contract, resource, or unexplained data-quality failure.

## 23. Recommended commit message

`security: bind source validation to outbound connections`
