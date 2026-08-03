# Collection architecture

Collection is an application use case with infrastructure adapters. `JobCollector`, `HttpClient`, generic extraction/browser ports, `Logger`, clock, sleeper, and persistence contracts are owned by the application layer. Infrastructure supplies Greenhouse and Lever collectors, the Fetch/Cheerio/Playwright adapters, structured stream logging, and the existing Prisma-backed persistence composition.

The CLI loads strict YAML, selects enabled supported sources, and starts at most three sources concurrently by default (configurable from 1 through 8). Jobs within a source are persisted sequentially. One source, malformed item, or job persistence failure does not stop unrelated work. Run and per-source summaries preserve created, updated, unchanged, linked, invalid, and persistence-failure counts.

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

Greenhouse uses its public board API with `content=true`; Lever uses its public postings API in JSON mode. Top-level responses are schema validated, while malformed individual jobs are counted and isolated. External IDs are deduplicated per response. Normalization trims and Unicode-normalizes strings, decodes entity-encoded ATS markup before removing executable content and tags, and preserves headings and list bullets in conservative plain text. It accepts HTTPS URLs, maps only explicit employment/workplace values, and retains unknown location text as metadata. It does not infer skills, seniority, salary, geography, or suitability.

Generic sources follow the static-first bounded policy in [generic-web-extraction.md](generic-web-extraction.md). They share the same downstream normalization and persistence behavior; extraction confidence is provenance, not job ranking.

Run status is `COMPLETED` when all sources succeed, `PARTIALLY_FAILED` when useful work completes with source or persistence failures, `FAILED` when every attempted source fails, and `CANCELLED` after a termination signal. A minimal migration adds per-source partial-failure status and persistence-failure count.
