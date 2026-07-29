# Collection architecture

Collection is an application use case with infrastructure adapters. `JobCollector`, `HttpClient`, `Logger`, clock, sleeper, and persistence contracts are owned by the application layer. Infrastructure supplies Greenhouse and Lever collectors, the Fetch-based HTTP stack, structured stream logging, and the existing Prisma-backed persistence composition.

The CLI loads strict YAML, selects enabled supported sources, and starts at most three sources concurrently by default (configurable from 1 through 8). Jobs within a source are persisted sequentially. One source, malformed item, or job persistence failure does not stop unrelated work. Run and per-source summaries preserve created, updated, unchanged, linked, invalid, and persistence-failure counts.

## HTTP policy

Public endpoints must use HTTPS; loopback HTTP exists only for controlled local testing. Requests have a finite 15-second default timeout, a five-MiB response cap, cancellation, and no more than three total attempts. Only network, timeout, HTTP 408, 429, and 5xx failures retry, with bounded exponential delays. A per-source queue enforces the configured request interval; different sources remain independent. Logged endpoints omit query strings and no payloads or configuration values are logged.

## Collector and normalization scope

Greenhouse uses its public board API with `content=true`; Lever uses its public postings API in JSON mode. Top-level responses are schema validated, while malformed individual jobs are counted and isolated. External IDs are deduplicated per response. Normalization trims and Unicode-normalizes strings, converts descriptions to conservative plain text, accepts HTTPS URLs, maps only explicit employment/workplace values, and retains unknown location text as metadata. It does not infer skills, seniority, salary, geography, or suitability.

Run status is `COMPLETED` when all sources succeed, `PARTIALLY_FAILED` when useful work completes with source or persistence failures, `FAILED` when every attempted source fails, and `CANCELLED` after a termination signal. A minimal migration adds per-source partial-failure status and persistence-failure count.
