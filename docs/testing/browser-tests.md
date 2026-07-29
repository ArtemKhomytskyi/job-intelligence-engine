# Browser tests

Browser tests are separate from ordinary Vitest tests. They use a local synthetic HTTP server and never contact a live career site.

```sh
npm run playwright:install
npm run test:browser
```

CI uses `npm run playwright:install:ci`, which installs Chromium and its OS dependencies only. A passing test proves that a client-rendered fixture is rendered in an isolated context and then parsed by the shared extractor. It does not prove compatibility with public sites.

On restricted systems, launching the cached browser binary may require permission outside the workspace sandbox. Report an unavailable browser honestly rather than treating the graceful fallback as a passed browser test.
