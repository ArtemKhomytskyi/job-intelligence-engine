# Generic web extraction

`generic-page` handles one job detail URL. `generic-job-list` handles a listing URL and, when `maxTraversalDepth` is one or two, follows a bounded set of job-like detail links. This is extraction, not a general crawler.

The order is: validate URL, fetch static HTML with manual bounded redirects, resolve same-origin canonical metadata, decode JSON-LD `JobPosting`, fall back to conservative semantic markup, discover job-like links for list sources, and render with Chromium only for a recognized JavaScript app shell. Rendered HTML re-enters the same canonical/JSON-LD/semantic extractor. Normalized candidates use the existing collection orchestration and persistence ports.

Application owns `HtmlPageAcquirer`, `HtmlDocumentExtractor`, and `BrowserPageRenderer` contracts. Infrastructure provides Fetch, Cheerio, DNS/IP safety validation, and Playwright adapters. Domain and application do not import Playwright, Cheerio, Fetch, or Prisma.

## Bounds and safety

- Production URLs are public HTTPS without embedded credentials; fragments are removed.
- DNS answers and literal IPs are rejected when loopback, private, link-local, multicast, unspecified, or otherwise non-public. Every redirect and browser request is checked. This mitigates SSRF but cannot eliminate DNS rebinding or environment-specific proxy risk.
- Static HTML is capped at 5 MiB, rendered HTML at 2 MiB, redirects at five, total pages at 60, browser renders at 10, and detail concurrency at three.
- JSON-LD processing is capped at 20 blocks and 512 KiB per block. Descriptions are capped at 50,000 characters.
- Browser navigation and operations have finite timeouts and caller cancellation. Each render gets a new context/page; service workers, permissions, downloads, images, media, fonts, WebSockets, and event sources are blocked.
- CAPTCHA, login, and access-denied pages are classified and not bypassed. Known Greenhouse and Lever hosts produce a diagnostic recommending their dedicated collector.

Canonical URLs prefer valid same-origin Schema.org `url`, `mainEntityOfPage`, HTML canonical, then final response URL. Known ATS application/canonical links may cross origin. Field metadata records strategy, confidence, and evidence; it is explanatory, not a suitability score.

See the [generic collector guide](../collectors/generic-web.md), [browser tests](../testing/browser-tests.md), and [real-site review policy](../testing/generic-real-site-review.md).
