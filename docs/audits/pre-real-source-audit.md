# Pre-real-source audit

## 1. Executive summary

JIE's deterministic application pipeline, local report, persistence model, and
supported collector decoders are well tested and generally follow the documented
Clean Architecture boundaries. This audit confirmed and fixed correctness,
request-integrity, bounded-read, browser-routing, readiness, privacy, CI, and
documentation defects. The final suites pass: 225 unit/integration/smoke tests,
5 browser tests, and 18 guarded PostgreSQL tests.

The follow-up connection-bound hardening pass closed the HTTP DNS
time-of-check-to-time-of-use gap and removed external Chromium fallback from the
pilot exposure. Every HTTP hop now connects only to its conservatively validated
address while retaining original-hostname Host, SNI, and certificate semantics.
External browser extraction remains deliberately deferred. The complete suites
now pass under Node 22/npm 10: 246 ordinary tests, 6 browser tests, and 18
guarded PostgreSQL tests. The updated status is documented in
[connection-bound-network-hardening.md](connection-bound-network-hardening.md).

## 2. Audit scope

The audit covered architecture, configuration and placeholder protection,
collector contracts, URL and browser security, the local HTTP surface, privacy,
data quality, PostgreSQL/Prisma, pipeline behavior, tests, CI, dependencies,
performance bounds, and onboarding. Dynamic checks used synthetic fixtures,
injected transports, loopback servers, and the guarded localhost `jie_test`
database. No real career site was contacted. Private YAML, environment values,
credentials, and existing user data were not copied into this report.

New collectors, hosted services, accounts, authentication, CAPTCHA bypass,
automatic application submission, source-definition changes, and broad
refactors were out of scope.

## 3. Repository and environment

- Audited branch: `fix/chunk-7-real-source-setup`; base commit: `e85ae5a`.
- Host shell: Windows/PowerShell. The hardening verification used disposable
  Node.js `v22.23.0` and npm `10.9.4`.
- Declared runtime: Node.js `>=22.13 <23`; package manager: npm `10.9.4`.
- PostgreSQL 17-compatible schema with four applied migrations; guarded tests
  ran against `jie_test` on loopback.
- Chromium was exercised through Playwright after granting local process-launch
  permission. The sandboxed attempt failed with `spawn EPERM`, as expected.
- Docker CLI and `psql` were not installed. Docker Compose validation could not
  be executed. The database was still verified through Prisma and the complete
  repository suite.
- A clean npm 10 `npm ci` preserved the lockfile byte-for-byte, and
  `verify:full` passed under the declared Node 22/npm 10 toolchain.

## 4. Research basis

The review used primary guidance and current contracts: [OWASP SSRF
prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html),
[OWASP XSS
prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html),
[OWASP CSRF
prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Request_Forgery_Prevention_Cheat_Sheet.html),
[Node.js releases](https://nodejs.org/en/about/previous-releases),
[PostgreSQL 17 transaction
isolation](https://www.postgresql.org/docs/17/transaction-iso.html), [Prisma
Migrate](https://docs.prisma.io/docs/orm/prisma-migrate), [Playwright
BrowserContext](https://playwright.dev/docs/api/class-browsercontext),
[Greenhouse Job Board API](https://developers.greenhouse.io/job-board.html),
[Lever Postings API](https://github.com/lever/postings-api), [Google JobPosting
guidance](https://developers.google.com/search/docs/appearance/structured-data/job-posting),
[GitHub Actions
guidance](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/using-pre-written-building-blocks-in-your-workflow),
[npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/), and [TypeScript strict
mode](https://www.typescriptlang.org/tsconfig/strict).

## 5. System inventory

The delivery flow is CLI/local HTTP to application use cases, with domain rules
inside `src/domain` and filesystem, HTTP, browser, extraction, logging, and
Prisma adapters inside `src/infrastructure`. The product inventory includes
configuration loading, source collection, generic extraction, raw persistence,
normalization, conservative deduplication, hard filters, deterministic scoring,
diversity selection, recommendation-batch persistence, report queries, pipeline
status, and explicit application-status mutations.

Supported runtime source contracts are `greenhouse`, `lever`,
`generic-job-list`, and `generic-page`. Legacy `generic-jsonld` configuration is
now rejected before composition. Examples intentionally contain no enabled real
source.

## 6. Architecture findings

No domain-to-outer-layer or interface-to-infrastructure inversion was found in
the reviewed imports. Composition remains in the interface layer, application
ports own persistence and transport expectations, and domain behavior remains
free of Prisma, Zod, filesystem, browser, and HTTP dependencies. Explicit
relative imports and strict TypeScript are preserved.

One low-priority inconsistency remains: the application fingerprint helper uses
Node's crypto module directly while processing hashing has an infrastructure
adapter. It is deterministic and does not create an exploit or cycle, so no
speculative refactor was made.

## 7. Security findings

### SSRF, redirects, and DNS

URL parsing rejects credentials, non-HTTP schemes, fragments, non-default ports,
localhost/private/link-local/multicast/unspecified addresses, and benchmark,
documentation, and special-use ranges. The hardened HTTP transport resolves
each hostname once, rejects it if any answer is forbidden, deterministically
selects an allowed address, and binds the actual socket lookup to that address.
Redirects repeat the full policy. The URL is not rewritten to an IP, so original
Host, TLS SNI, and certificate verification semantics are preserved.

### Browser fallback

External browser fallback is rejected at configuration/readiness boundaries and
again by the renderer before browser launch. Chromium remains usable only for
explicit HTTP loopback fixtures in test mode. Those contexts are isolated;
service workers, WebSockets, downloads, permissions, unsupported methods and
heavy resources are blocked, while requests, popups, frames, navigation and
context lifetime are bounded. Connection-bound external browser networking and
pre-consumption main-document byte enforcement remain deferred features, not
pilot exposure.

### Local web, XSS, and mutation integrity

The server binds to loopback, validates Host, applies a restrictive CSP and
security headers, escapes dynamic HTML, emits separately served JavaScript, and
bounds request bodies. Recommendation URLs are normalized before rendering.
Mutation requests now fail closed unless an exact same-origin `Origin` or valid
same-origin `Referer` is present; existing Fetch Metadata and Host checks remain.
No stack trace, Prisma error, path, credential, or raw environment value was
found in user-facing failure rendering.

### Secrets, privacy, and resource exhaustion

Ignored private configuration and `.env` values were not read into audit output.
Tracked examples are synthetic; the personal-looking example display name was
replaced with `Example Candidate`. Fetch bodies are now read incrementally and
cancelled at the byte limit, including streams without `Content-Length`.
JSON-LD decode failures, including excessive recursion, are isolated per posting
instead of crashing extraction. Configuration/source-array cardinalities are
not globally capped, but they are local operator-controlled inputs and remain a
LOW availability concern.

## 8. Collector contract findings

- **Greenhouse:** the fixed public board endpoint, encoded board token,
  `content=true`, public job URL, identifiers, departments, locations, and
  optional timestamps are compatible with the official Job Board API. Synthetic
  decoding tests pass.
- **Lever:** the global postings endpoint and decoded fields match the published
  global contract. The official EU endpoint is not supported, configured
  `jobsUrl` is informational, pagination is not implemented, and `createdAt` is
  not guaranteed by the current documented list response. Treat the collector
  as global-endpoint-only until those limitations are deliberately designed.
- **JSON-LD:** `JobPosting`, `@graph`, arrays, malformed blocks, and deep malformed
  candidates are handled independently within existing byte/count bounds.
- **Semantic HTML:** extraction is conservative and fixture-tested; it cannot
  promise compatibility with arbitrary sites and must fail visibly rather than
  silently infer unsupported markup.
- **Playwright:** fallback reuses the same extractor and now covers popup and
  request-method isolation. It remains blocked from production use by the HIGH
  network/resource risks in section 7.

## 9. Data-quality findings

Normalization, versioned fingerprints, conservative duplicate relationships,
filter decisions, score explanations, stable ordering, and recommendation
selection are deterministic in the reviewed paths. A confirmed source-identity
defect was fixed: recommendation candidates previously received database source
UUIDs while configuration context is keyed by configuration source IDs. That
silently dropped source tags and source track restrictions. Repository tests now
assert configuration IDs.

The report repository also read a nonexistent `countryCode` field instead of
persisted `country`; it now renders the complete location. Retry diagnostics now
report actual attempts rather than configured maximum attempts.

## 10. PostgreSQL findings

All four migrations apply cleanly and migration status is current. The 18-test
database suite verifies repositories, idempotency, rollback, status history,
processing decisions, recommendation batches, duplicate relations, collection,
generic extraction, the full fixture pipeline, HTTP reporting, Chromium status
mutation, and the corrected source/location mappings.

Uniqueness constraints protect key identities and histories. Default PostgreSQL
Read Committed isolation still permits a race between concurrent canonical job
insertion or next-revision calculation; not every application invariant
(nonnegative counters, rank/score ranges, temporal ordering) is duplicated as a
database CHECK. These are open MEDIUM hardening items. No schema change was made
without a demonstrated corruption case and forward-migration design.

## 11. Pipeline and web findings

The full pipeline retains failed collection state, stops downstream stages on
stage failure, exposes safe failure/status information, and uses
redirect-after-POST. Genuine unexpected exceptions remain generic HTTP 500s.
Duplicate status/manual-run submissions are covered for integrity and active-run
coordination. The browser and database end-to-end tests exercise report sorting,
explainability, safe pipeline failure, retained state, and explicit status.

The newly fixed recommendation source-ID mismatch was the most material
pipeline correctness finding because it crossed persistence/configuration
boundaries without throwing.

## 12. Testing findings

Tests are synthetic, deterministic, and separated into ordinary, browser, and
guarded database suites. Security regressions now cover incremental body limits,
special-use IP ranges, missing mutation provenance, browser popups/methods,
unsupported legacy source type, deep JSON-LD, source readiness, source identity,
and persisted location.

The ordinary suite does not import runtime composition (`local-runtime.ts` has
zero ordinary-suite coverage), but browser/database end-to-end tests cover that
composition externally. The initial database run's only failure was Chromium
`spawn EPERM` inside the sandbox; the authorized rerun passed.

## 13. CI and supply-chain findings

CI uses Node 22, `npm ci`, lint/type/build/unit/coverage, Prisma validation and
generation, PostgreSQL migration/database tests, browser installation/tests,
and the full verification flow. `actions/checkout` and `actions/setup-node` are
now pinned to immutable full commit SHAs with version comments.

`npm audit` reports zero vulnerabilities. `npm outdated` reports intentionally
pinned updates: Prisma 6.19.3 to 7.9.1, Node types 22.20.1 to 26.1.2, Playwright
1.62.0 to 1.62.1, and TypeScript 5.9.3 to 7.0.2. Major upgrades were not folded
into an audit. `npm ls --all` exits successfully; platform/test optional
dependencies are absent as expected, and Prisma's installed tree reports an
extraneous nested `magicast` package. Reproducibility should be rechecked with a
clean Node 22/npm 10 `npm ci` environment before release.

## 14. Performance findings

Collection and extraction have request timeouts, retry limits, response limits,
candidate limits, browser navigation limits, and bounded recommendation/report
queries. Existing high-cardinality deterministic tests pass. Incremental Fetch
body enforcement removes the confirmed unbounded materialization path.

The unresolved Chromium main-document limit is enforced only after navigation
and `page.content()`, not at the network stream. It remains a HIGH blocker for
any future external browser-enabled product mode; the controlled pilot cannot
enter that mode.

## 15. Documentation and onboarding findings

Example configuration validates and deliberately reports zero enabled real
sources. `sources:check --examples` exits nonzero with safe placeholder reasons
and performs no network request. The generic collector guide now uses disabled
placeholder-only examples and tells users to copy privately before editing. A
wrong manual-review CLI option and stale collect help text were corrected.

The local host lacked Docker, `psql`, Node 22, and npm 10, so onboarding is not
fully reproducible on this machine. Database verification remained complete via
the already available guarded loopback PostgreSQL service.

## 16. Risk register

The final evidence, severity, disposition, and pilot control for every finding
are in [pre-real-source-risk-register.md](pre-real-source-risk-register.md).
PRS-002 is fixed for HTTP. PRS-003 and PRS-020 are removed from the controlled
HTTP-only pilot exposure by the enforced external-browser prohibition. See the
hardening report for the final gate evidence and residual restrictions.

## 17. Confirmed fixes

1. Enforced Fetch response limits while streaming and cancelled oversized
   bodies before full materialization.
2. Rejected enabled legacy `generic-jsonld` sources during runtime configuration
   validation.
3. Required same-origin `Origin` or `Referer` for local mutation requests.
4. Applied Playwright routing to the BrowserContext, covered popups, and blocked
   non-GET/HEAD browser requests.
5. Corrected persisted report location from `countryCode` to `country`.
6. Supplied configuration source IDs to recommendation context instead of
   database UUIDs.
7. Isolated deep/malformed JSON-LD candidates instead of crashing extraction.
8. Reported actual HTTP retry attempts.
9. Rejected additional IPv4/IPv6 special-use destinations.
10. Marked `generic-jsonld` unsupported rather than configuration-ready in source
    readiness output.
11. Replaced personal-looking example identity and asserted synthetic examples.
12. Corrected generic-source docs, manual-review CLI syntax, and collect help.
13. Pinned GitHub Actions to verified immutable commit SHAs.
14. Bound every HTTP(S) socket to a conservatively validated DNS answer while
    preserving original-hostname Host, SNI, and certificate verification.
15. Revalidated and rebound every redirect and retry independently; disabled
    per-request socket reuse and unsupported content encodings.
16. Rejected external browser fallback before collection/browser launch and
    retained browser execution only for bounded loopback fixtures in test mode.

No pipeline stage semantics, migrations, configured source definitions, or
real-source behavior were broadened.

## 18. Files added

- `docs/audits/pre-real-source-audit.md`
- `docs/audits/pre-real-source-risk-register.md`
- `docs/exec-plans/009-pre-real-source-audit.md`

## 19. Files modified

- `.github/workflows/ci.yml`
- `config/profile.example.yaml`
- `docs/collectors/generic-web.md`
- `docs/configuration/README.md`
- `docs/exec-plans/001-domain-model-and-configuration.md`
- `docs/exec-plans/README.md`
- `docs/testing/generic-real-site-review.md`
- `src/application/configuration/validate-configuration.ts`
- `src/domain/source-readiness.ts`
- `src/infrastructure/browser/playwright-browser-renderer.ts`
- `src/infrastructure/extraction/cheerio-document-extractor.ts`
- `src/infrastructure/http/node-fetch-http-client.ts`
- `src/infrastructure/http/public-url-safety-validator.ts`
- `src/infrastructure/http/retrying-http-client.ts`
- `src/infrastructure/persistence/recommendation-report-repository.ts`
- `src/infrastructure/persistence/repositories.ts`
- `src/interfaces/cli/output.ts`
- `src/interfaces/cli/sources-check-command.ts`
- `src/interfaces/web/local-report-handler.ts`
- `tests/browser/playwright-generic-extraction.test.ts`
- `tests/database/repositories.test.ts`
- `tests/helpers/fixture-site-server.ts`
- `tests/integration/cli-behavior.test.ts`
- `tests/integration/cli.test.ts`
- `tests/integration/configuration-loading.test.ts`
- `tests/integration/local-report-http.test.ts`
- `tests/unit/cli-output.test.ts`
- `tests/unit/configuration-schemas.test.ts`
- `tests/unit/generic-extraction.test.ts`
- `tests/unit/http-clients.test.ts`
- `tests/unit/source-readiness.test.ts`

## 20. Commands executed

Exit codes are final rerun results unless a diagnostic failure is explicitly
listed. Environment assignments for the ignored database URL are omitted to
avoid disclosing credentials; all database commands targeted loopback
`jie_test` and passed the repository guard.

| Command                                                               |     Exit | Result or failure cause                                                           |
| --------------------------------------------------------------------- | -------: | --------------------------------------------------------------------------------- |
| `node --version`                                                      |        0 | `v24.18.0`; does not match declared Node 22 range                                 |
| `npm.cmd --version`                                                   |        0 | `11.16.0`; does not match pinned npm 10.9.4                                       |
| `npm.cmd run format:check`                                            | 1 then 0 | Five formatting deviations; passed after `npm.cmd run format`                     |
| `npm.cmd run format`                                                  |        0 | Repository formatter applied                                                      |
| `npm.cmd run lint`                                                    |        0 | No warnings                                                                       |
| `npm.cmd run typecheck`                                               |        0 | Strict type check passed                                                          |
| `npm.cmd test`                                                        |        0 | 25 files, 225 tests                                                               |
| `npm.cmd test -- tests/unit`                                          |        0 | 18 files, 168 tests                                                               |
| `npm.cmd test -- tests/integration`                                   |        0 | 6 files, 56 tests                                                                 |
| `npm.cmd test -- tests/smoke.test.ts`                                 |        0 | 1 file, 1 test                                                                    |
| `npm.cmd run test:coverage`                                           |        0 | 25 files, 225 tests; thresholds passed                                            |
| `npm.cmd run prisma:format`                                           |        0 | Schema formatted with no material change                                          |
| `npm.cmd run prisma:validate`                                         |        0 | Schema valid                                                                      |
| `npm.cmd run prisma:generate`                                         |        0 | Prisma Client 6.19.3 generated                                                    |
| `npm.cmd run build`                                                   |        0 | Clean TypeScript build passed                                                     |
| `npm.cmd run test:browser`                                            | 1 then 0 | Sandbox Chromium `spawn EPERM`; authorized run: 2 files, 5 tests                  |
| `npm.cmd run db:test:migrate`                                         | 1 then 0 | Missing `TEST_DATABASE_URL`; guarded loopback rerun found no pending migrations   |
| `npm.cmd run test:db`                                                 | 1 then 0 | 17 assertions passed before sandbox Chromium `spawn EPERM`; authorized run: 18/18 |
| `npm.cmd exec -- prisma migrate status --schema prisma/schema.prisma` |        0 | Four migrations; `jie_test` schema current                                        |
| `npm.cmd run verify`                                                  |        0 | Complete standard aggregate passed                                                |
| `npm.cmd run verify:full`                                             |        0 | Standard, browser, migration, and database aggregate passed                       |
| `npm.cmd run cli -- validate-config --examples`                       |        0 | Synthetic examples valid; zero enabled sources                                    |
| `npm.cmd run cli -- sources:check --examples`                         |        1 | Expected safety result: no real enabled sources; no network request               |
| `npm.cmd run cli -- db:check`                                         |        0 | Database healthy                                                                  |
| `npm.cmd audit`                                                       |        0 | Zero vulnerabilities                                                              |
| `npm.cmd outdated`                                                    |        1 | npm's expected status when pinned packages are behind latest                      |
| `npm.cmd ls --all`                                                    |        0 | Dependency tree resolved; optional-platform omissions noted                       |
| `docker compose config`                                               |        1 | Docker executable not installed                                                   |
| `git diff --check`                                                    |        0 | No whitespace errors                                                              |

Targeted regression commands were also run before and after each fix. Expected
pre-fix failures reproduced: an unbounded streaming body, accepted
`generic-jsonld`, origin-less mutation, popup browser traffic, incorrect report
country/source identity, deep JSON-LD stack overflow, inaccurate retry count,
accepted special-use addresses, and incorrect readiness output. Their focused
reruns and the complete suites pass after the fixes.

## 21. Test counts

| Category                   | Files | Tests | Final result |
| -------------------------- | ----: | ----: | ------------ |
| Unit                       |    18 |   168 | PASS         |
| Integration                |     6 |    56 | PASS         |
| Smoke                      |     1 |     1 | PASS         |
| Ordinary suite total       |    25 |   225 | PASS         |
| Browser                    |     2 |     5 | PASS         |
| PostgreSQL                 |     1 |    18 | PASS         |
| Final aggregate executions |    28 |   248 | PASS         |

The aggregate count is categorical, not a claim of 248 unique tests across all
reruns; browser/database suites are intentionally separate from ordinary
Vitest.

## 22. Coverage

The final coverage run passed with 91.57% statements (2273/2482), 80.59%
branches (1828/2268), 94.26% functions (542/575), and 92.82% lines (2146/2312).
The largest deliberate gap is interface composition, which is validated through
browser/database end-to-end tests rather than ordinary-suite instrumentation.

## 23. Open limitations

- External browser extraction is disabled: Chromium does not yet have a
  connection-bound network layer or a pre-consumption main-document byte bound.
- MEDIUM: Lever supports only the documented global endpoint; no EU or explicit
  pagination contract.
- MEDIUM: concurrent canonical job/revision creation is not proven safe under
  all Read Committed races.
- MEDIUM: several application invariants are not database CHECK constraints.
- LOW: local configuration cardinalities can be large; operator control is the
  current bound.
- Environment: Docker Compose validation was unavailable on this host.

## 24. Readiness gates

| Gate                                     | Result         | Evidence                                               |
| ---------------------------------------- | -------------- | ------------------------------------------------------ |
| Clean Architecture and strict TypeScript | PASS           | Import review, lint, typecheck, build                  |
| Secrets/privacy and synthetic examples   | PASS           | Diff/config review and regression assertions           |
| Supported collector decode contracts     | PASS           | Official-contract review and fixture tests             |
| Incremental HTTP response bound          | PASS           | Synthetic unbounded stream is cancelled                |
| Connection-bound SSRF/DNS protection     | PASS           | Pinned per-hop socket lookup and synthetic TLS tests   |
| Browser pre-load resource bound          | NOT EXPOSED    | External fallback rejected before browser launch       |
| Local web XSS and mutation integrity     | PASS           | Escaping/CSP/Host/provenance/body tests                |
| Deterministic pipeline/data correctness  | PASS           | Ordinary and database suites; source-ID/location fixes |
| Unit/integration/smoke                   | PASS           | 246/246                                                |
| Browser                                  | PASS           | 6/6                                                    |
| Guarded PostgreSQL/migrations            | PASS           | 18/18; four migrations current                         |
| Coverage                                 | PASS           | All configured thresholds exceeded                     |
| CI and dependency vulnerability audit    | PASS           | SHA pins; zero vulnerabilities                         |
| Declared local Node 22/npm 10 evidence   | PASS           | v22.23.0/npm 10.9.4 `npm ci` and `verify:full`         |
| Documentation and placeholder protection | PASS           | Example validation/readiness and docs review           |
| No open HIGH risks in pilot exposure     | PASS           | HTTP fixed; external browser fallback prohibited       |
| Real-source network test                 | NOT APPLICABLE | Explicitly prohibited by audit scope                   |

## 25. Final status

`READY FOR CONTROLLED HTTP-ONLY PILOT`

This is a narrow pilot decision, not a production-readiness claim. External
browser fallback remains prohibited.

## 26. Controlled pilot plan

1. Begin with one public global Greenhouse source; keep generic
   browser fallback disabled. Do not use Lever EU until explicitly supported.
2. Back up the local database, run `sources:check`, collect once, inspect counts,
   failures, URLs, timestamps, duplicates, filters, score explanations, and
   retained pipeline state before adding a second source.
3. Use low request rates and short bounded runs. Stop on redirect-policy,
   resource-limit, contract-shape, or unexplained data-quality failures. No
   authenticated scraping, CAPTCHA bypass, or application submission.
4. Consider only a small global Lever source after separate review. Generic
   page/list sources must remain HTTP-only with browser fallback false.

## 27. Recommended commit message

`audit: harden JIE before real source integration`
