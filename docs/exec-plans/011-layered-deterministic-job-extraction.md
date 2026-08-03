# Layered deterministic job extraction

- **Status:** Blocked
- **Owner:** Codex
- **Last updated:** 2026-08-03

## Objective

Increase structured coverage from arbitrary job descriptions so scoring and
filtering receive deterministic evidence for skills, experience, education,
languages, location/work arrangements, compensation, qualifications, and other
explicit requirements.

## Background

Collectors and persistence retain descriptions, but the current processing
normalizer recognizes only a small skill dictionary, narrow experience and
education patterns, six spoken languages, and limited authorization phrases.
Generic JSON-LD preserves only a subset of Schema.org fields, and semantic HTML
does not retain section or bullet provenance. Consequently valid description
evidence becomes neutral scoring input.

## Current repository state

- Greenhouse content and Lever descriptions reach `normalizeCollectedJob`.
- Generic extraction decodes JSON-LD and semantic HTML into `ExtractedJob`.
- Collection normalization converts HTML to bounded line-oriented plain text.
- `normalizeJobForProcessing` derives requirements into a JSON-backed normalized
  payload; changing that payload does not require a database migration.
- `normalization-v1` is part of processing idempotency and must change when
  deterministic semantics change.

## Scope

- Audit and document every material loss boundary.
- Add a pure, bounded, layered description analyzer.
- Merge structured metadata, semantic text, sections, bullets, and sentences.
- Expand deterministic taxonomies and requirement/context classification.
- Add optional source, confidence, and strategy evidence.
- Preserve current collectors and scoring contracts while enriching normalized
  output.
- Add representative synthetic fixtures modeled on common ATS descriptions.

## Non-goals

- New ATS providers, scoring changes, UI changes, external APIs, LLMs, fuzzy or
  probabilistic extraction, source-site contact, schema migrations, and private
  job-description fixtures.

## Architectural constraints

The analyzer is pure domain code and depends only on domain types. Application
and infrastructure may supply structured or semantic evidence inward. Cheerio,
Zod, Prisma, filesystem, network, and process APIs remain outside the domain.
Rules are fixed, bounded, deterministic, and ordered.

## Affected modules

- `domain`: description analysis types, taxonomy, parsing, normalization merge.
- `application/collection`: retain useful line/bullet structure and metadata.
- `infrastructure/extraction`: preserve Schema.org enrichment fields.
- tests/fixtures: synthetic ATS-style HTML and descriptions.
- architecture/collector documentation: contracts, layers, confidence, bounds.

## Interfaces and data contracts

Existing required fields remain stable. `EnrichedNormalizedJob` gains a
`descriptionAnalysis` object, and existing requirement records gain optional
provenance. `ExtractedJob.metadata` remains the compatibility path for
structured-source facts. `NORMALIZATION_VERSION` advances to v2.

## Implementation sequence

1. Capture baseline loss behavior with focused tests.
2. Implement bounded document segmentation and section classification.
3. Add deterministic term, experience, education, language, authorization,
   location/work arrangement, employment, compensation, and statement rules.
4. Merge structured-source evidence before text evidence and deduplicate without
   replacing higher-confidence facts.
5. Integrate with normalization and generic JSON-LD extraction.
6. Add representative Greenhouse/semantic/JSON-LD fixtures and end-to-end tests.
7. Update documentation and run the complete required verification matrix.

## Error handling

Malformed or absent content yields partial or empty analysis, never a pipeline
failure. Individual rules are bounded and do not evaluate source-provided regex.
Conflicting facts are retained with evidence or resolved by documented layer and
confidence order; no unsupported inference is emitted.

## Observability considerations

Each fact optionally records source section, deterministic confidence, and a
stable strategy name. Existing collection warnings remain unchanged.

## Security and privacy considerations

Fixtures are synthetic and contain no personal data. Parsing is offline,
bounded by the existing description limit plus per-section/result caps. No real
source is contacted and no executable page content is evaluated.

## Testing strategy

- Unit tests for segmentation, aliases, negative context, requirement levels,
  provenance, bounds, deduplication, malformed content, and all requested field
  groups.
- Generic extractor tests for structured JSON-LD enrichment.
- Collector/processing integration tests proving Greenhouse-style HTML survives
  collection and reaches normalized output.
- Existing collector, processing, scoring, browser, and database suites remain
  green.

## Documentation updates

- `docs/architecture/job-processing.md`
- `docs/architecture/generic-web-extraction.md`
- collector guidance and this living plan

## Acceptance criteria

- [x] Representative descriptions produce non-empty structured requirements.
- [x] Structured, semantic, section, bullet, and sentence layers enrich rather
      than replace one another.
- [x] Every new fact includes deterministic provenance when available.
- [x] Existing collector public interfaces remain compatible.
- [x] No network access, LLM, external API, or migration is introduced.
- [x] Mandatory verification passes.

## Verification commands

```sh
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:coverage
npm.cmd run build
npm.cmd run cli -- validate-config --examples
npm.cmd run test:browser
npm.cmd run db:test:migrate
npm.cmd run test:db
npm.cmd run verify:full
git diff --check
```

## Risks

False positives can degrade recommendations. Mitigations are explicit word
boundaries, section/context classification, negative-context rules, conservative
confidence, stable caps, and representative regression tests. Taxonomy growth
can become monolithic, so parsing and vocabulary responsibilities remain
separate modules.

## Rollback considerations

The analyzer, metadata enrichment, tests, and documentation can be reverted as
one unit. No migration or irreversible data mutation is required; v2 decisions
coexist with v1 history.

## Unresolved questions

- None. The existing normalized JSON payload is the extension boundary.

## Implementation notes

- 2026-08-03: Audited collection, generic extraction, normalization, processing
  types, persistence, and existing tests. Confirmed the primary loss is narrow
  deterministic parsing rather than missing description collection.
- 2026-08-03: Implemented `normalization-v2`, structured JSON-LD retention,
  Lever list retention, split semantic-container merging, bullet preservation,
  layered analysis, expanded taxonomies/policies, provenance, and representative
  synthetic ATS-style coverage.
- 2026-08-03: Format, lint, typecheck, 253 ordinary tests, build, coverage, CLI
  validation, 6 browser tests, guarded migration, and 18 database tests pass.
  The initial `verify:full` attempt reached and passed ordinary tests but could
  not complete `prisma:generate` while pre-existing Node processes held the
  generated Windows query-engine DLL.
- 2026-08-03: After the owning processes were closed, standalone Prisma Client
  generation and the complete guarded Node 22/npm 10 `verify:full` aggregate
  passed. The final aggregate includes 253 ordinary tests, 6 browser tests, and
  18 database tests with no pending migrations. Coverage and example
  configuration validation also pass after the aggregate run.

## Final outcome

Implementation and mandatory verification are complete. The transient Windows
DLL lock is resolved, and no verification blocker remains.
