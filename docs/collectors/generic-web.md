# Generic web collector

Configure `generic-page` for a job detail URL or `generic-job-list` for a
careers/listing URL. Both require a public HTTPS `settings.url`. Defaults are a
30-second browser timeout, 50 discovered links, depth zero for a page and one for
a list, and browser fallback **disabled**.

```yaml
sources:
  - id: my-generic-job-list
    type: generic-job-list
    enabled: false
    displayName: Replace with careers page name
    company: Replace with company name
    tags: [custom]
    trackIds: []
    requestTimeoutMs: 15000
    requestsPerSecond: 1
    settings:
      url: https://replace-with-real-careers-url.example/jobs
      browserTimeoutMs: 15000
      maxDiscoveredLinks: 25
      maxTraversalDepth: 1
      allowBrowserFallback: false
```

This is a disabled documentation template. Copy it only into the ignored
`config/sources.yaml`, replace every placeholder, and then enable the source.

Allowed bounds are browser timeout 3,000–90,000 ms, links 1–200, and depth 0–2. A list at depth zero only extracts jobs embedded on its root page. Links must be same-origin job-like links or recognized Greenhouse/Lever links. Dedicated ATS collectors remain preferred when detected.

The extractor supports Schema.org arrays and `@graph`, isolates malformed blocks/items, cleans executable and navigation markup from semantic descriptions, and records field evidence. It never attempts CAPTCHA/login bypass and does not run arbitrary evaluation code. Generic extraction is intentionally conservative and not guaranteed to work on every site.

For the controlled HTTP-only pilot, `allowBrowserFallback` must be false.
Runtime validation rejects an enabled external generic source set to true with
`BROWSER_FALLBACK_EXTERNAL_UNSAFE` before a collection run is created.
Playwright is not a production fallback: it remains available only to explicit
loopback fixtures. A JavaScript-only external page yields static extraction
diagnostics rather than launching Chromium.

Install Chromium only to run isolated loopback fixtures with `npm run
test:browser`. Collect enabled HTTP sources with `npm run cli -- collect --json`.
To select one generic kind, add `--type generic-page` or `--type
generic-job-list`.
