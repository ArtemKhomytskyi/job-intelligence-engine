# Collectors

Greenhouse, global Lever, Ashby, SmartRecruiters, and Recruitee use connection-bound public JSON requests. Workable, BambooHR, Teamtailor, Personio, and Jobvite delegate their public careers pages to the bounded generic list/detail collector. Generic
web sources use connection-bound bounded static HTML extraction. External
browser fallback is disabled; Playwright exists only for explicit loopback test
fixtures. All collectors return application-owned candidates to the same
normalization, orchestration, and persistence path.

Greenhouse HTML content and Lever rich descriptions/list sections retain
heading and bullet boundaries for `normalization-v2`. The deterministic layered
analyzer enriches collector data after persistence; collectors do not embed
source-specific scoring or inference rules.

See [generic web extraction](generic-web.md) and the [collection architecture](../architecture/collection.md).

Provider discovery recognizes URL, redirect, and HTML fingerprints without guessing. `UNKNOWN_PROVIDER` is a valid explainable result. `discover-company`, `discover-all`, `show-providers`, `show-company`, `show-discovery`, `health`, and `coverage` expose discovery and persisted crawl state. Workday and authenticated/private provider APIs are intentionally unsupported.
