# Generic extraction real-site review

This is a manual follow-up activity, not automated acceptance. Select a small, documented set of public career pages only after checking site terms, robots guidance, applicable law, and organizational authorization. Include dedicated ATS and custom pages, with both static and JavaScript-rendered examples; do not use authenticated, personalized, or access-controlled pages.

Limit each review to one configured source, one request per second, at most 10 discovered links, depth one, and the normal time/size ceilings. Prefer the dedicated Greenhouse or Lever collector when detected. Stop on CAPTCHA, login, rate limiting, access denial, unexpected high request volume, or terms concerns.

Run manually with a private ignored configuration:

```sh
npm run cli -- collect --source-id <review-source-id> --json
```

Record date, reviewer, public URL category (not private tokens), dedicated/custom ATS, static/rendered path, requests/pages/browser renders, fields present or missing, canonical/application URL accuracy, evidence/confidence, warnings, and persistence outcome. Classify failures as configuration, URL safety, network/HTTP, redirect, block page, markup/JSON-LD, semantic ambiguity, traversal limit, browser unavailable/timeout, normalization, or persistence.

Do not commit captured HTML, cookies, personal data, screenshots, or browser state. Redact query parameters and identifiers from reports. A successful observation is point-in-time evidence only and gives no guarantee of long-term compatibility or production readiness.
