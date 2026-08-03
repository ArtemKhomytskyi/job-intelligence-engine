# Collection architecture

Collection is an application use case with infrastructure adapters. `JobCollector`, `HttpClient`, generic extraction/browser ports, `Logger`, clock, sleeper, company-registry, and persistence contracts are owned by the application layer. Infrastructure supplies ATS collectors, discovery, Fetch/Cheerio/Playwright adapters, structured stream logging, conditional HTTP caching, and Prisma-backed persistence composition.

The CLI loads strict YAML, resolves enabled explicit sources plus enabled companies, and starts at most three sources concurrently by default (configurable from 1 through 8). Same-provider work is capped at two sources by default and HTTP rate limiting is keyed by hostname. Results retain configured order even when requests complete out of order. Jobs within a source are persisted sequentially. One source, malformed item, or job persistence failure does not stop unrelated work. Run and per-source summaries preserve created, updated, unchanged, linked, invalid, and persistence-failure counts.

## Discovery and incremental retrieval

Discovery applies explicit overrides, redirect/final URL patterns, careers URL patterns, and bounded HTML fingerprints in descending deterministic confidence. Ties and absent evidence return `UNKNOWN_PROVIDER`; diagnostics contain only safe host/path evidence. Company names alone are never converted into guessed URLs. The registry stores the current discovery result and immutable crawl outcomes.

The shared HTTP decorator persists response bodies with ETag and Last-Modified validators. Later requests send `If-None-Match` and `If-Modified-Since`; a 304 reuses the bounded cached body. Existing source IDs, canonical URLs, fingerprints, and revisions continue to decide job-level create/update/unchanged outcomes.

## HTTP policy

Public endpoints must use HTTPS; loopback HTTP exists only for controlled local
testing. Each hostname is resolved through the injected resolver, every returned
IPv4/IPv6 address must pass policy, and the deterministically selected address
is supplied to the actual per-request socket lookup. The original hostname is
retained for Host, TLS SNI, and certificate verification. Agents and socket
reuse are disabled. Every redirect repeats resolution, validation, and binding;
automatic redirects are disabled.

Requests have a finite 15-second deadline covering connection and body
consumption, a five-MiB byte cap, cancellation, and no more than three total
attempts. The client requests identity encoding and rejects encoded responses,
so decompression cannot occur below the byte counter. `Content-Length` is an
advisory early check; streamed bytes remain authoritative. Only resolver,
network, timeout, HTTP 408, 429, and 5xx failures retry. Logged endpoints omit
query strings and no payloads, resolved private addresses, or configuration
values are logged.

## Collector and normalization scope

Greenhouse and Lever use their public JSON APIs. Ashby, SmartRecruiters, and Recruitee use shared schema-validated public JSON collection. Workable, BambooHR, Teamtailor, Personio, and Jobvite reuse bounded generic list/detail extraction over their public careers pages because no credential-free JSON contract is assumed. Top-level responses are schema validated, malformed jobs are isolated, and external IDs are deduplicated per response. Workday remains unsupported.

Generic sources follow the static-first bounded policy in [generic-web-extraction.md](generic-web-extraction.md). They share the same downstream normalization and persistence behavior; extraction confidence is provenance, not job ranking.

Run status is `COMPLETED` when all sources succeed, `PARTIALLY_FAILED` when useful work completes with source or persistence failures, `FAILED` when every attempted source fails, and `CANCELLED` after a termination signal. A minimal migration adds per-source partial-failure status and persistence-failure count.
