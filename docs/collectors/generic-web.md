# Generic web collector

Configure `generic-page` for a job detail URL or `generic-job-list` for a careers/listing URL. Both require a public HTTPS `settings.url`. Defaults are a 30-second browser timeout, 50 discovered links, depth zero for a page and one for a list, and browser fallback enabled.

```yaml
sources:
  - id: example-custom-careers
    type: generic-job-list
    enabled: true
    displayName: Example custom careers
    company: Example Company
    tags: [custom]
    trackIds: []
    requestTimeoutMs: 15000
    requestsPerSecond: 1
    settings:
      url: https://careers.example.test/jobs
      browserTimeoutMs: 15000
      maxDiscoveredLinks: 25
      maxTraversalDepth: 1
      allowBrowserFallback: true
```

Allowed bounds are browser timeout 3,000–90,000 ms, links 1–200, and depth 0–2. A list at depth zero only extracts jobs embedded on its root page. Links must be same-origin job-like links or recognized Greenhouse/Lever links. Dedicated ATS collectors remain preferred when detected.

The extractor supports Schema.org arrays and `@graph`, isolates malformed blocks/items, cleans executable and navigation markup from semantic descriptions, and records field evidence. It never attempts CAPTCHA/login bypass and does not run arbitrary evaluation code. Generic extraction is intentionally conservative and not guaranteed to work on every site.

Install Chromium once with `npm run playwright:install`, run isolated browser fixtures with `npm run test:browser`, and collect all enabled sources with `npm run cli -- collect --json`. To select one generic kind, add `--type generic-page` or `--type generic-job-list`.
