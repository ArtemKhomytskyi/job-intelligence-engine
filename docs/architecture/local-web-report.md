# Local web report

`npm run cli -- serve` starts a server-rendered report at
`http://127.0.0.1:3000`. V1 accepts only the literal IPv4 loopback host. It has
no accounts, authentication service, remote assets, analytics, cloud backend,
or public deployment mode.

## Boundaries

HTTP routing and request/response mapping live in `src/interfaces/web`.
Application report use cases own filter, sort, detail, and status contracts.
The Prisma report adapter loads bounded relation graphs from PostgreSQL without
one-query-per-recommendation behavior. HTML rendering, CSS, JavaScript, and the
generic Node listener are outer infrastructure.

The list query loads at most 1,000 recommendations from one explicit or latest
batch and excludes job descriptions. Details load one recommendation, its
persisted score/component breakdown, normalized evidence, source references,
and immutable status history. Scores are never recalculated by the report.

## Routes

- `GET /` redirects to `/recommendations`.
- `GET /recommendations` renders the latest batch and validated query filters.
- `GET /recommendations/:id` renders complete details and may auto-mark VIEWED.
- `POST /recommendations/:id/status` explicitly sets VIEWED, APPLIED, or SKIPPED.
- `GET /runs/latest` renders latest collection, processing, and batch records.
- `POST /actions/run` invokes the shared full-pipeline application service.
- `GET /health` checks PostgreSQL and returns minimal JSON.
- `GET /assets/app.css` and `GET /assets/app.js` serve local assets.

Unknown filters are 400 responses, missing recommendations are 404, active-run
conflicts are 409, and unexpected/storage failures are safe 500 pages. Stack
traces, environment values, filesystem paths, database URLs, and Prisma errors
are not rendered.

## Filters and ordering

Bookmarkable query parameters are `track`, `status`, `company`,
`minimumScore`, `batch`, and `sort`. Company matching is case-insensitive.
Sorts are `rank`, `score-desc`, `opportunity-desc`, `freshness-desc`,
`company`, `title`, and `status-updated-desc`. Every comparator ends with the
recommendation ID; missing freshness sorts after known dates.

## Status semantics

Opening details changes NEW or RECOMMENDED to VIEWED using an injected clock.
Repeated views are idempotent. APPLIED and SKIPPED are never overwritten by
automatic viewing. Existing Chunk 6 selection excludes APPLIED and SKIPPED.
Explicit forms use the transactional current-status plus immutable-history
model.

## Security and lifecycle

Mutation requests must have the exact local Host and, when present, the exact
same Origin and `Sec-Fetch-Site: same-origin`. Bodies are URL-encoded and capped
at 8 KiB. POST responses use 303 redirects. Source text is HTML-escaped; Apply
and source links are public-URL checked and use `noopener noreferrer`. CSP
denies remote resources; security headers deny framing/sniffing and restrict
referrers to same-origin requests so local mutation Origin checks remain usable.

Startup validates configuration, checks PostgreSQL, then binds. SIGINT/SIGTERM
close the listener, browser renderer, and Prisma client. A process-local lock
allows one run at a time and releases in `finally`. It does not coordinate
separately launched JIE processes, an accepted single-user V1 limitation.
