# Architecture overview

Job Intelligence Engine discovers and evaluates job opportunities locally, with user-controlled configuration and explainable outcomes. Chunk 7 composes the complete deterministic pipeline and delivers the final V1 local server-rendered recommendation report and application tracker.

The local-first model keeps configuration, candidate information, and derived records on infrastructure controlled by the user. Optional external integrations may later cross explicit adapters, but core evaluation must remain usable without a cloud service.

## Layers

- **Domain** holds technology-independent contracts and range invariants.
- **Application** orchestrates configuration, collection, extraction, processing, scoring, recommendation selection, and persistence use cases and owns narrow ports.
- **Infrastructure** implements filesystem/YAML/Zod, HTTP, Cheerio, Playwright, and Prisma/PostgreSQL adapters.
- **Interfaces** provide configuration, collection, processing, recommendation, full-run, database, and serve CLI commands plus local HTTP routing.
- **Shared** is reserved for small business-neutral primitives that genuinely serve multiple layers.

The primary direction is `interfaces -> application -> domain`. Infrastructure depends inward to implement ports owned by application or domain; inner code does not import infrastructure. This prevents Prisma records, HTTP payloads, scraper behavior, and framework lifecycles from becoming domain concepts.

Future source collectors and output adapters should be replaceable implementations composed at an outer entry point. Collection must not decide reporting, and presentation must not know how sources are queried. New mechanisms should extend at ports established by real use cases rather than through speculative universal interfaces.

Accepted design choices and their trade-offs are recorded in the [architecture decision records](../adr/README.md).

The current domain vocabulary is described in [domain-model.md](domain-model.md), processing in [job-processing.md](job-processing.md), scoring and selection in [scoring-recommendations.md](scoring-recommendations.md), the [end-to-end pipeline](end-to-end-pipeline.md), the [local report](local-web-report.md), storage in [storage.md](storage.md), generic extraction in [generic-web-extraction.md](generic-web-extraction.md), configuration under [docs/configuration](../configuration/README.md), and database operations under [docs/database](../database/README.md).
