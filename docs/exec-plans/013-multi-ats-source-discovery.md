# Multi-ATS Expansion and Source Discovery

- **Status:** Implementation complete; live multi-provider validation pending private configuration
- **Owner:** Codex
- **Last updated:** 2026-08-03

## Objective

Expand JIE from manually configured single-provider collection to deterministic company-first discovery and bounded multi-ATS collection, with persisted discovery/crawl health and incremental HTTP state.

## Background

The ranking pipeline is validated against one live Greenhouse company. Broader ranking validation requires a larger, provider-diverse job universe without changing extraction, candidate intelligence, scoring, selection, or report semantics.

## Current repository state

Greenhouse, Lever, generic-page, and generic-job-list collectors share the application HTTP and normalization ports. Collection already has global bounded source concurrency, per-source rate keys, isolated source failures, stable source-summary ordering, and PostgreSQL job revisions. Provider discovery, company configuration, provider-specific concurrency, conditional HTTP, company registry, and detailed crawl health are absent.

## Scope

- Deterministic provider discovery with explainable evidence and `UNKNOWN_PROVIDER`.
- Company-first configuration with source overrides.
- Shared ATS collector primitives and adapters for Greenhouse, Lever, Ashby, SmartRecruiters, Workable, BambooHR, Recruitee, Teamtailor, Personio, and Jobvite.
- Persisted company/discovery registry, crawl health, and conditional HTTP state.
- Provider/domain bounded concurrency and deterministic result ordering.
- Discovery, provider, company, health, and coverage CLI queries.
- Local-report crawl-health visibility.
- Synthetic deterministic provider benchmark fixtures and a guarded live validation.

## Non-goals

- Workday, automatic applications, hosted services, LLM extraction, scoring changes, selector changes, or ATS-specific scoring behavior.
- Committing real private company configuration or downloaded job descriptions.

## Architectural constraints

Discovery contracts and orchestration live in application/domain-facing modules. Zod, HTTP, Prisma, filesystem, process, and Commander remain in outer layers. Collectors emit the existing normalized collection candidate contract and reuse existing extraction and persistence. Network targets continue through the connection-bound URL validator.

## Affected modules

- `domain`: source/company configuration and provider values.
- `application/collection`: discovery, collector contracts, scheduling, health models, ports.
- `infrastructure/collectors`: shared paginated ATS collector and provider adapters.
- `infrastructure/persistence`: registry, health, incremental-state adapters.
- `interfaces/cli`: discovery and coverage commands.
- `infrastructure/web`: health reporting.

## Interfaces and data contracts

- `CompanyConfig`, `DiscoveredSource`, `DiscoveryDiagnostic`, provider capabilities.
- Conditional request/response metadata (`ETag`, `Last-Modified`, `304`).
- Company registry and crawl-health persistence ports.
- Provider adapters that describe listing requests/pages and map provider records into `CollectedJobCandidate`.

## Implementation sequence

1. Add configuration/provider/discovery models and pure fingerprint discovery.
2. Add shared collector primitives and provider adapters with synthetic fixtures.
3. Add registry/health/incremental schema and Prisma adapters.
4. Integrate discovery and bounded provider/domain scheduling into collection composition.
5. Add CLI/report read models.
6. Add benchmark, performance measurements, live validation, and documentation.

## Error handling

Discovery returns typed outcomes and safe diagnostics; it never guesses. Provider failures remain isolated per source/company. Conditional-cache corruption falls back to an unconditional request and records a diagnostic. Genuine persistence failures retain existing stage-failure semantics.

## Observability considerations

Persist discovery method/confidence, request/redirect/failure counts, discovered/changed/removed counts, duration, collector version, conditional-request usage, and safe error codes. Do not persist response bodies or credentials as diagnostics.

## Security and privacy considerations

All discovered URLs must pass existing public HTTPS and connection-bound validation before requests. Redirect validation remains mandatory. Configuration and diagnostics must not expose credentials, environment data, or private profile information. Tests use synthetic `.test` fixtures only; live downloaded data remains in ignored PostgreSQL storage.

## Testing strategy

Pure unit tests cover URL/HTML fingerprints, ambiguous/unknown outcomes, stable scheduling, conditional requests, and all provider mappings. Integration tests cover configuration, CLI, report health, and partial failures. PostgreSQL tests cover registry/upsert/health state. A generated synthetic benchmark exceeds 1,000 records without committing third-party descriptions.

## Documentation updates

Collector architecture, provider matrix, discovery, company configuration, concurrency/rate limits, health metrics, CLI, local report, database schema, and execution-plan index.

## Acceptance criteria

- [x] Ten supported ATS providers including existing Greenhouse and Lever; Workday excluded.
- [x] Unknown discovery is explicit and diagnostic.
- [x] Company-first configuration resolves deterministically with override support.
- [x] Provider/domain concurrency is bounded and output ordering stable.
- [x] Conditional HTTP and revision persistence avoid unnecessary writes.
- [x] Company/discovery/crawl health is persisted and reportable.
- [x] Synthetic benchmark contains at least 1,000 jobs across required role categories.
- [ ] Live multi-provider run is attempted safely and results documented.
- [x] Extraction, scoring, selection, and application behavior remain unchanged.
- [x] Full verification and coverage pass.

## Verification commands

```sh
npm run verify:full
npm run test:coverage
npm run cli -- validate-config --examples
npm run cli -- validate-config
git diff --check
```

## Risks

- Undocumented ATS endpoints change: isolate schemas, preserve diagnostics, and test fixtures.
- Discovery false positives: require provider-specific evidence thresholds and return unknown on ties.
- Provider throttling: per-domain rate keys, provider caps, retries, and conservative defaults.
- Live benchmark volatility/copyright: persist locally only and keep committed benchmarks synthetic.

## Rollback considerations

New company configuration remains optional and existing explicit sources stay supported. New tables are additive. Provider adapters can be disabled independently without changing downstream processing.

## Unresolved questions

- Which real companies expose stable public endpoints for every priority-2 provider at validation time.
- Whether every provider supports useful ETag/Last-Modified metadata; unsupported providers continue identifier/hash-based incrementality.

## Implementation notes

- 2026-08-03: Existing source concurrency is globally bounded and stable, but rate keys are source IDs rather than domains and no conditional response metadata is exposed.
- 2026-08-03: Implementation and synthetic verification completed. The private configuration contains one enabled Figma Greenhouse source and no verified multi-provider company set, so a live multi-provider run was not fabricated or performed by changing private source definitions.

## Final outcome

The multi-ATS discovery, collection, incremental HTTP, health persistence, CLI, and local-report implementation is complete and passes the full automated verification suite. Live multi-provider volume, discovery-accuracy, throughput, and memory measurements remain pending until the private configuration supplies verified companies across multiple providers.
