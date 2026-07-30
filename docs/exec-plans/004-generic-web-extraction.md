# Generic web extraction

- **Status:** Implemented; PostgreSQL verification blocked by local environment
- **Owner:** Project contributors
- **Last updated:** 2026-07-29

## Objective

Extend the existing Chunk 3 collector pipeline with bounded, static-first extraction for explicitly configured public generic job pages and job-list pages, using JSON-LD first, deterministic semantic HTML second, and an isolated Chromium/Playwright fallback only when static evidence justifies it.

## Background and repository state

The current branch is `feature/chunk-4-generic-web-extraction`, the working tree was clean at inspection, and Chunk 3 is present as commit `19dc082` through merge `7bda155`. Chunk 3 already owns collector registration, resilient JSON HTTP, normalization, source/job failure isolation, persistence, metrics, logging, and the `collect` CLI. Chunk 4 extends those boundaries rather than creating another collection path.

## Scope

- `generic-page`: one configured public page expected to describe zero or one job.
- `generic-job-list`: one configured public listing page, embedded jobs plus a bounded deterministic queue of detail links.
- Safe text/HTML acquisition with manual bounded redirects and final URL propagation.
- Canonical metadata, Greenhouse/Lever classification, JSON-LD `JobPosting`, semantic HTML, cleanup, bounded discovery/traversal, and evidence.
- Application-owned browser renderer lifecycle port with a Chromium-only Playwright adapter.
- Existing normalization, collector orchestration, persistence, CLI, logging, and status semantics.
- Synthetic unit fixtures, local HTTP integration tests, dedicated local browser tests, and guarded PostgreSQL vertical coverage.

## Non-goals

LinkedIn or provider-specific scraping, arbitrary crawling, authentication, CAPTCHA/access-control bypass, user profiles/cookies, stealth, proxy rotation, forms or applications, AI/LLM/OCR extraction, sitemap/robots automation, scheduling, filtering, scoring, recommendations, or candidate matching.

## Source-type semantics and configuration

`generic-page` expects one detail document and does not traverse descendants. `generic-job-list` may consume embedded `JobPosting` objects and visit detail URLs at depth one. Existing `generic-jsonld` remains a configuration contract for compatibility but is not silently redefined. Common source controls remain `company`, `requestTimeoutMs`, and `requestsPerSecond`; generic settings add required `url` plus `browserTimeoutMs` (3,000–90,000; default 30,000), `maxDiscoveredLinks` (1–200; default 50), `maxTraversalDepth` (0–2; defaults 0/1 by source type), and `allowBrowserFallback` (default true). No selectors, scripts, headers, credentials, or cookies are configurable in this chunk.

## Extraction order and acceptance

For each page: validate URL, acquire static HTML, retain redirect/final URL metadata, parse once, detect block/login state and ATS markers, select canonical metadata, discover all bounded JSON-LD blocks, decode acceptable `JobPosting` objects, then attempt deterministic semantic extraction only when JSON-LD yields none. Browser fallback is considered only after static parsing, and rendered HTML re-enters the same parser/extractor. Candidates then use Chunk 3 normalization and persistence.

JSON-LD candidates require a non-empty title, configured or extracted company, a meaningful description or application URL, and a safe canonical/source URL. Semantic candidates require title, company, selected description/application evidence, and an aggregate confidence of at least 0.65. Field evidence and strategy are retained in bounded metadata; raw HTML is never persisted.

## Traversal and resource limits

- Five redirects per acquisition, with loop detection and validation of every target.
- Five MiB static HTML and two MiB rendered HTML.
- Twenty JSON-LD blocks, 512 KiB per block, and deterministic per-object isolation.
- Generic-page: one page, depth zero.
- Generic-job-list: 50 discovered links by default, depth one, at most 60 total pages.
- Three concurrent static detail fetches and one browser page at a time; source concurrency remains the Chunk 3 limit.
- At most ten browser fallbacks per source, finite request/navigation/source work, AbortSignal propagation, visited URL deduplication, and deterministic output order.

## URL safety and redirect policy

Only public HTTPS is allowed in normal runtime. An internal injected test policy permits HTTP loopback for controlled fixture servers; YAML cannot enable it. Reject credentials, unsupported schemes, localhost, private/link-local/unspecified/multicast IP literals, metadata addresses, and alternate numeric IPv4 representations. Resolve public hostnames before requests and reject private results; document DNS rebinding/TOCTOU limits. Revalidate configured, redirect, discovered, canonical, application, and final browser URLs. Redirects are manual, bounded, carry no cookies, and retain only safe fixed headers; cross-origin redirects do not forward source-specific headers.

Canonical priority is `JobPosting.url`, `mainEntityOfPage`, same-origin HTML canonical, then final acquired URL. Fragments are removed and meaningful queries preserved. Unexpected cross-origin canonicals are rejected unless the target is a recognized Greenhouse/Lever host.

## ATS handling

Classify Greenhouse and Lever from configured, redirect, final, canonical, and application URLs with provider, reason, matched host, and recommendation. Automatic delegation is not implemented because generic configuration does not reliably contain the dedicated collector board token/company slug and recursive delegation would complicate current registry semantics. Detection is retained as evidence while the shared generic extractor continues, avoiding duplicate dual-path collection.

## Browser fallback and lifecycle

Fallback requires `allowBrowserFallback`, remaining limits/deadline, no acceptable static candidate, no permanent HTTP/URL/size/block-page failure, and positive JS-rendering evidence such as a thin app shell, explicit JS-required message, client root, job UI marker without links, or known JS-heavy classification. A fresh context is created without a user profile or storage state. Downloads and permissions are disabled; dialogs are dismissed; images/media/fonts are blocked while document/script/fetch/XHR/styles remain available. No clicks, form submissions, screenshots, video, traces, or configuration JavaScript occur. The CLI owns one managed browser adapter and closes it in `finally`; each render closes its page/context.

## Dependency implications

Use a small maintained HTML parser rather than regex or a full DOM. The intended choice is Cheerio as a runtime dependency (MIT) for scripts, links, metadata, semantic traversal, and deterministic text selection. Use official `playwright` as a runtime dependency (Apache-2.0) because the installed application invokes Chromium fallback; browser-dependent tests remain a separate script and Chromium is installed explicitly. Exact pinned versions, Node 22 compatibility, licenses, lockfile impact, and official installation commands will be confirmed before installation.

## Error and failure semantics

Add structured extraction codes for unsafe URLs, redirects, response size, invalid/malformed documents, no acceptable job, block/login/CAPTCHA pages, traversal limits, browser unavailable/timeout/failure, and cancellation. Malformed JSON-LD blocks and individual candidates warn and continue. One failed detail page increments invalid-page metrics without discarding successful details. A source fails only when no useful extraction completes and the source-level condition is terminal; partial page failures preserve the existing partial-failure semantics through collector warnings/invalid counts and later persistence outcomes.

## Fixture and testing strategy

All fixtures are synthetic. Focused HTML covers single/array/graph/malformed JSON-LD, schema variations, semantic detail/list pages, canonical/relative/duplicate/unsafe links, noisy/hidden content, oversized data, app shells, rendered jobs, block/login/CAPTCHA pages, redirects, cycles, and limits. Unit tests inject acquisition/browser/clock behavior. Local integration uses a loopback fixture server and real safe HTTP/parser/collector; dedicated browser tests use the same server and real Chromium. Guarded database tests compose the real generic collector/orchestrator/repositories. Automated tests contain no public URLs.

## Implementation sequence

1. Confirm and install pinned parser/browser dependencies; update scripts, CI, and ignores.
2. Extend source configuration and collection models/registry support.
3. Define extraction models, policies, errors, acquisition/parser/browser ports.
4. Implement URL/DNS safety, manual redirects, bounded HTML acquisition, canonical URL, and ATS detection.
5. Implement Cheerio document parsing, JSON-LD traversal/decoding, cleanup, semantic extraction, and link discovery.
6. Implement deterministic generic extraction engine and thin collectors for both registry source types.
7. Implement managed Playwright fallback and resource/block-page policy.
8. Wire the normal CLI composition and close browser resources.
9. Add fixtures, unit/local HTTP/browser/database tests and metrics assertions.
10. Update architecture, collector, configuration, testing, responsible-use, ADR, and real-site review documentation.
11. Run the full verification/browser/database/security matrix and complete this plan outcome.

## Verification

Run the complete prompt matrix: install/CI install; format, lint, typecheck, unit, coverage, Prisma, build, verify, example configuration, dependency tree/audit/diff; Playwright version/Chromium install and repository browser tests; controlled static/list/browser fixtures; Compose/database lifecycle and `verify:full` where available; CI inspection; and focused searches for boundary violations, unsafe types/evaluation, credentials/browser artifacts, unbounded concurrency, raw SQL, and ignored local data.

## Risks and limitations

- Generic extraction is heuristic and less stable than dedicated ATS collectors.
- DNS validation cannot eliminate rebinding between resolution and connection with native Fetch; this limitation must remain explicit.
- Browser rendering executes public site JavaScript inside Chromium and therefore stays isolated, bounded, and opt-in per source.
- HTML/parser/provider changes may reduce field coverage; evidence and warnings make failures observable.
- Local Docker/PostgreSQL and Chromium availability may constrain verification; blocked commands must be reported and CI remains authoritative only for commands it actually runs.

## Implementation notes

- 2026-07-29: Confirmed correct branch, clean tree, Chunk 3 history, and existing inward-owned collection/persistence pipeline.
- 2026-07-29: Chose two thin registry collectors sharing one extraction engine because the current registry maps exactly one collector per source discriminator.
- 2026-07-29: Chose static-first extraction, depth-zero detail pages, depth-one listing pages, no automatic ATS delegation, and internal-only loopback test policy.
- 2026-07-29: Added exact Cheerio 1.2.0 and Playwright 1.62.0 dependencies, Chromium-only installation scripts, static and rendered extraction, depth-zero through depth-two bounded traversal, URL/redirect safety, CLI composition, diagnostics, fixtures, CI, and documentation.
- 2026-07-29: Installed Chromium successfully. Regular tests (75), the isolated Chromium test, coverage thresholds, formatting, lint, typecheck, Prisma validation/generation, build, example configuration, and npm audit passed.
- 2026-07-29: Docker was not installed and `TEST_DATABASE_URL` was unavailable. Compose validation and the new real-repository vertical test could not run locally; CI is configured to run both.

## Final outcome

Chunk 4 is implemented through the existing inward-owned collection and persistence architecture. Generic detail/list sources use public-HTTPS validation, manual safe redirects, Cheerio JSON-LD/semantic extraction, bounded breadth traversal, and justified isolated Playwright fallback. Extraction evidence and operational diagnostics reach existing normalization and persistence without raw HTML or browser state.

Automated acceptance remains synthetic and fixture-only. Generic extraction has not been validated against public career sites and is not claimed production-ready. The only incomplete local verification is PostgreSQL/Compose because Docker and a guarded test database were unavailable; the database-backed test itself is committed and CI runs it with PostgreSQL.
