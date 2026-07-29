# 0010: Use static-first bounded generic web extraction

- Status: Accepted
- Date: 2026-07-29

## Context

Custom career sites vary widely and cannot be covered by dedicated ATS APIs alone. Generic extraction introduces untrusted URLs, markup, redirects, and JavaScript, so it needs stronger resource and privacy boundaries than the existing API collectors.

## Decision

Generic sources use an application-owned extraction port with infrastructure adapters. Fetch static HTML first, select canonical metadata, decode Schema.org `JobPosting`, then use conservative semantic HTML extraction. A shared Playwright Chromium process may render a page only when static markup is an identifiable client-rendered shell; the rendered HTML goes through the same extractor.

All configured and redirected URLs are revalidated. Production URLs are credential-free public HTTPS. Traversal, response sizes, redirects, concurrency, browser fallbacks, timeouts, JSON-LD blocks, and discovered links are bounded. Browser contexts are isolated per page and do not persist cookies, downloads, profiles, screenshots, video, or storage state.

Cheerio 1.2.0 (MIT) parses HTML and Playwright 1.62.0 (Apache-2.0) provides Chromium automation.

## Consequences

Static pages remain cheap and deterministic, and browser complexity stays outside the application layer. Conservative rules may miss legitimate jobs and SSRF defenses reduce risk rather than proving safety against every network topology. Automated acceptance uses synthetic local fixtures; real-site compatibility requires a separate responsible manual review.

## Alternatives

- Browser-first extraction was rejected because it is slower, more stateful, and expands the attack surface.
- Site-specific scripts were rejected because they do not provide a generic boundary.
- A recursive crawler was rejected because its resource and legal scope would exceed this chunk.
