# Architecture overview

Job Intelligence Engine is intended to discover and evaluate job opportunities locally, with user-controlled configuration and explainable outcomes. Chunk 0 establishes only engineering boundaries; it contains no collectors, profiles, domain entities, scoring, persistence models, or delivery interfaces.

The local-first model keeps configuration, candidate information, and derived records on infrastructure controlled by the user. Optional external integrations may later cross explicit adapters, but core evaluation must remain usable without a cloud service.

## Layers

- **Domain** will hold technology-independent concepts and rules.
- **Application** will orchestrate use cases and define narrow ports needed from outer systems.
- **Infrastructure** will implement persistence, collection, and other technology adapters.
- **Interfaces** will translate CLI, HTTP, or UI requests into application calls and results back into presentation forms.
- **Shared** is reserved for small business-neutral primitives that genuinely serve multiple layers.

The primary direction is `interfaces -> application -> domain`. Infrastructure depends inward to implement ports owned by application or domain; inner code does not import infrastructure. This prevents Prisma records, HTTP payloads, scraper behavior, and framework lifecycles from becoming domain concepts.

Future source collectors and output adapters should be replaceable implementations composed at an outer entry point. Collection must not decide reporting, and presentation must not know how sources are queried. New mechanisms should extend at ports established by real use cases rather than through speculative universal interfaces.

Accepted design choices and their trade-offs are recorded in the [architecture decision records](../adr/README.md).
