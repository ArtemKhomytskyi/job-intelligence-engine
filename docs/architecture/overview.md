# Architecture overview

Job Intelligence Engine is intended to discover and evaluate job opportunities locally, with user-controlled configuration and explainable outcomes. Chunk 1 defines domain contracts and validated configuration. It does not implement collectors, normalization, filtering, scoring calculations, persistence, APIs, or UI.

The local-first model keeps configuration, candidate information, and derived records on infrastructure controlled by the user. Optional external integrations may later cross explicit adapters, but core evaluation must remain usable without a cloud service.

## Layers

- **Domain** holds technology-independent contracts and range invariants.
- **Application** orchestrates configuration loading, owns narrow ports, and validates relationships between documents.
- **Infrastructure** implements filesystem access, YAML/Zod boundary validation, and explicit mapping. Future technology adapters also belong here.
- **Interfaces** currently provide the configuration CLI and will translate later delivery mechanisms into application calls.
- **Shared** is reserved for small business-neutral primitives that genuinely serve multiple layers.

The primary direction is `interfaces -> application -> domain`. Infrastructure depends inward to implement ports owned by application or domain; inner code does not import infrastructure. This prevents Prisma records, HTTP payloads, scraper behavior, and framework lifecycles from becoming domain concepts.

Future source collectors and output adapters should be replaceable implementations composed at an outer entry point. Collection must not decide reporting, and presentation must not know how sources are queried. New mechanisms should extend at ports established by real use cases rather than through speculative universal interfaces.

Accepted design choices and their trade-offs are recorded in the [architecture decision records](../adr/README.md).

The current domain vocabulary is described in [domain-model.md](domain-model.md), and configuration usage is documented under [docs/configuration](../configuration/README.md).
