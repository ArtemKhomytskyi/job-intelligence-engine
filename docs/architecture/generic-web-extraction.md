# Generic web extraction

`generic-page` handles one job detail URL. `generic-job-list` handles a listing URL and, when `maxTraversalDepth` is one or two, follows a bounded set of job-like detail links. This is extraction, not a general crawler.

The order is: validate and connection-bind the URL, fetch static HTML with
manual bounded redirects, resolve same-origin canonical metadata, decode JSON-LD
`JobPosting`, fall back to conservative semantic markup, and discover job-like
links for list sources. External Chromium fallback is disabled in V1. Rendered
HTML re-enters the extractor only in explicit loopback browser fixtures.
Normalized candidates use the existing collection orchestration and persistence
ports.

Application owns `HtmlPageAcquirer`, `HtmlDocumentExtractor`, and `BrowserPageRenderer` contracts. Infrastructure provides Fetch, Cheerio, DNS/IP safety validation, and Playwright adapters. Domain and application do not import Playwright, Cheerio, Fetch, or Prisma.

## Bounds and safety

- Production URLs are public HTTPS without embedded credentials; fragments are removed.
- Every DNS answer and literal IP must be public. The selected validated address
  is pinned into the actual socket lookup; original Host/TLS SNI/certificate
  verification remain. Redirects repeat the whole resolution/policy/binding
  step. Node's direct request path does not consume environment proxy settings.
- Static HTML is capped at 5 MiB, rendered HTML at 2 MiB, redirects at five, total pages at 60, browser renders at 10, and detail concurrency at three.
- JSON-LD processing is capped at 20 blocks and 512 KiB per block. Descriptions are capped at 50,000 characters.
- External browser fallback is rejected by runtime validation and by the renderer
  itself. Loopback-only tests retain finite timeouts/cancellation, isolated
  contexts, no persistent profiles/permissions/downloads/service workers, a
  strict method/resource policy, and request/popup/frame bounds.
- CAPTCHA, login, and access-denied pages are classified and not bypassed. Known Greenhouse and Lever hosts produce a diagnostic recommending their dedicated collector.

Canonical URLs prefer valid same-origin Schema.org `url`, `mainEntityOfPage`, HTML canonical, then final response URL. Known ATS application/canonical links may cross origin. Field metadata records strategy, confidence, and evidence; it is explanatory, not a suitability score.

See the [generic collector guide](../collectors/generic-web.md), [browser tests](../testing/browser-tests.md), and [real-site review policy](../testing/generic-real-site-review.md).
