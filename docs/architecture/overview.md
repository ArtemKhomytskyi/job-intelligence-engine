# Architecture overview

Job Intelligence Engine is intended to discover and evaluate job opportunities locally, with user-controlled configuration and explainable outcomes. Chunk 5 adds versioned normalization, conservative deduplication, and deterministic hard filters to the collection foundation. Scoring calculations, recommendation selection, APIs, and UI remain out of scope.

The local-first model keeps configuration, candidate information, and derived records on infrastructure controlled by the user. Optional external integrations may later cross explicit adapters, but core evaluation must remain usable without a cloud service.

## Layers

- **Domain** holds technology-independent contracts and range invariants.
- **Application** orchestrates configuration, collection, extraction, and persistence use cases and owns narrow ports.
- **Infrastructure** implements filesystem/YAML/Zod, HTTP, Cheerio, Playwright, and Prisma/PostgreSQL adapters.
- **Interfaces** provide configuration and database CLI commands and will translate later delivery mechanisms into application calls.
- **Shared** is reserved for small business-neutral primitives that genuinely serve multiple layers.

The primary direction is `interfaces -> application -> domain`. Infrastructure depends inward to implement ports owned by application or domain; inner code does not import infrastructure. This prevents Prisma records, HTTP payloads, scraper behavior, and framework lifecycles from becoming domain concepts.

Future source collectors and output adapters should be replaceable implementations composed at an outer entry point. Collection must not decide reporting, and presentation must not know how sources are queried. New mechanisms should extend at ports established by real use cases rather than through speculative universal interfaces.

Accepted design choices and their trade-offs are recorded in the [architecture decision records](../adr/README.md).

The current domain vocabulary is described in [domain-model.md](domain-model.md), processing in [job-processing.md](job-processing.md), storage in [storage.md](storage.md), generic extraction in [generic-web-extraction.md](generic-web-extraction.md), configuration under [docs/configuration](../configuration/README.md), and database operations under [docs/database](../database/README.md).
