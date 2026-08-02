# Browser tests

Browser tests are separate from ordinary Vitest tests. They use a local synthetic HTTP server and never contact a live career site.

Chunk 7 coverage also starts the local report on an ephemeral loopback port and
exercises list rendering, track filtering, score sorting, details,
explainability, automatic VIEWED behavior, safe apply attributes, explicit
APPLIED status, refresh, and persisted fixture state. It never opens the
external apply destination.

```sh
npm run playwright:install
npm run test:browser
```

CI uses `npm run playwright:install:ci`, which installs Chromium and its OS dependencies only. A passing test proves that a client-rendered fixture is rendered in an isolated context and then parsed by the shared extractor. It does not prove compatibility with public sites.

On restricted systems, launching the cached browser binary may require permission outside the workspace sandbox. Report an unavailable browser honestly rather than treating the graceful fallback as a passed browser test.
