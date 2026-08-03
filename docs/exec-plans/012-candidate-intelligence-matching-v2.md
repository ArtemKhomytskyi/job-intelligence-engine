# Candidate intelligence and matching V2

- **Status:** In progress
- **Owner:** Codex
- **Last updated:** 2026-08-03

## Objective

Make recommendation relevance materially candidate-specific by introducing a
validated Candidate Profile V2, deterministic role-family/title intelligence,
independent multi-track evaluation, candidate-fit gating, concrete evidence,
and persisted diagnostics for every evaluated eligible job.

## Background

The live Figma audit proved that the V1 pipeline is operational but matching is
too shallow. Source track allowlists can force unrelated assignments, title
matching is primarily token overlap, total experience is treated as relevant to
every role, missing values receive generous neutral scores, and opportunity
quality can leave irrelevant jobs close to the recommendation threshold.
Scores and selector exclusions are currently persisted only for selected jobs,
so empty batches require an in-memory replay to diagnose.

## Current repository state

- `profile.yaml` has one undifferentiated skill list and optional total years.
- Search tracks have target titles, include/exclude keywords, preferred skills,
  industries, priority, and quota; they lack role families and match gates.
- Source `trackIds` are interpreted as a strict allowlist by
  `CreateRecommendations.relevantTracks`.
- Hard filters compare mandatory job years with a global maximum independently
  of the candidate's total or track-specific experience.
- V1 title relevance uses exact normalized equality or token Jaccard overlap.
- `trackMatch` is explanatory only and has zero configured contribution.
- Missing component data scores 50; absent mandatory education/language scores 80. Confidence does not alter the final score.
- Final score mixes fit and quality; opportunity score includes final score,
  freshness, salary, application simplicity, and source quality.
- `selectBestTrack` always returns one enabled track and cannot represent a
  no-match result or alternative track evaluations.
- Only selected candidates are written as `JobScore` and `Recommendation`.
- The local report reads persisted selected recommendations and processing run
  counts, but cannot list evaluated-below-threshold candidates.
- Configuration validation catches structural/reference/range problems but has
  no warning severity and does not detect semantic cross-file contradictions.

## Scope

- Backward-compatible profile/search/source schema extensions with deterministic
  defaults and actionable semantic validation.
- Role-family taxonomy, title aliases, negative title/family evidence, and
  source track policy (`strict`, `preferred`, `unrestricted`).
- Independent evaluation of every permitted enabled track with a valid-match
  gate and complete alternative-track evidence.
- Track-specific experience and seniority handling, explicit stretch outcomes,
  section-aware structured skill evidence, and strong negative preferences.
- Candidate-fit and opportunity-quality separation so opportunity quality
  cannot compensate for a fundamental role mismatch.
- Persistence of every bounded evaluated eligible job, its scores, per-track
  results, threshold, selector outcome, and exact exclusion reason.
- Minimal local-report diagnostics for selected, below-threshold, no-track,
  hard-filtered, and selector-excluded outcomes.
- Configuration examples, architecture documentation, and same-pool/different-
  candidate acceptance coverage.

## Non-goals

New ATS providers, collection redesign, Extraction V2 redesign, LLMs,
embeddings, vector databases, cloud services, automatic applications,
source-specific title special cases, and lowering thresholds to create volume.

## Architectural constraints

Role analysis, matching, and scoring remain pure domain behavior. Application
services orchestrate bounded evaluation and selector outcomes. Prisma and HTML
remain infrastructure concerns. Configuration follows filesystem -> YAML -> Zod
-> domain mapping -> semantic validation. All matching is ordered, bounded,
explainable, and deterministic.

## Affected modules

- `domain`: candidate/search/source contracts, role taxonomy, track evaluation,
  experience outcomes, fit/quality scoring, reasons.
- `application/configuration`: cross-file errors and non-blocking warnings.
- `application/recommendations`: source-policy evaluation and all-candidate
  persistence input.
- `infrastructure/configuration`: V2 schemas and compatibility mapping.
- `infrastructure/persistence`: evaluated-candidate migration and repositories.
- `application/reporting`, `infrastructure/web`, `interfaces/web`: diagnostics.
- `config`, tests, and architecture documentation.

## Interfaces and data contracts

- Candidate Profile gains experience by role family, management/internship
  years, current/target seniority, categorized capabilities, certifications,
  target-role preferences, career preferences, and positive/negative evidence.
- Search tracks gain role families, adjacent/excluded titles, evidence classes,
  skill classes, role-specific experience, acceptable seniority, and optional
  minimum score.
- Sources gain explicit track policy; omitted policy preserves V1 strict
  semantics for backward compatibility.
- Score results gain candidate-fit score, valid-track state, exclusion reason,
  and all per-track evaluations.
- Recommendation batches gain bounded evaluated-job rows. Existing selected
  recommendation and historical score relationships remain readable.

## Implementation sequence

1. Capture V1 audit findings and representative failures in tests.
2. Extend schemas/domain contracts with compatibility defaults and semantic
   validation, including CLI-visible warnings.
3. Add pure title normalization and role-family taxonomy.
4. Implement independent track evaluation, source policy, no-valid-track state,
   structured skill evidence, experience outcomes, and exclusions.
5. Introduce candidate-fit gating and revise missing-data semantics while
   retaining deterministic component ordering.
6. Persist all evaluated jobs and selector outcomes through a Prisma migration.
7. Add report diagnostics and concrete evidence rendering.
8. Update examples/docs and run same-pool/different-candidate acceptance tests.
9. Run full verification and the controlled stored-Figma acceptance replay.

## Error handling

Schema and semantic contradictions identify section, field path, conflicting
value, related path, and correction. Blocking errors prevent execution.
Warnings remain visible to validation callers and CLI output. A no-valid-track
result is data, not an exception. Persistence remains transactional and bounded.

## Observability considerations

Every evaluated candidate records candidate fit, opportunity quality, final
score, threshold, all track results, inclusion/exclusion stage, and exact reason.
Diagnostics must make a legitimate zero-result batch explainable without replay.

## Security and privacy considerations

Candidate data remains local configuration and PostgreSQL data. No network or AI
service receives profile or job evidence. Examples and fixtures remain synthetic.
Report output is escaped and does not expose raw configuration or credentials.

## Testing strategy

- Schema and semantic validation tests, including warnings.
- Pure title/role-family/alias/boundary tests.
- Multi-track, source-policy, no-match, negative evidence, structured skill,
  experience, fit-gate, deterministic-order tests.
- Same job pool with data/AI, DevRel, sales, junior, and senior-manager profiles.
- Repository migration and historical compatibility tests.
- Browser diagnostics tests and stored-Figma deterministic acceptance replay.

## Documentation updates

Profile, search-track, source-policy, processing, scoring, recommendation,
persistence, report diagnostics, example configuration, and execution-plan index.

## Acceptance criteria

- [x] Candidate configuration alone materially changes recommendations.
- [x] Irrelevant titles cannot receive a valid track through source restriction.
- [x] No evidence means no valid track, with an exact persisted reason.
- [x] Total and track-specific experience have explicit, non-contradictory use.
- [x] Opportunity quality cannot overcome inadequate candidate fit.
- [x] Every evaluated eligible job is queryable with selector diagnostics.
- [x] Configuration contradictions are actionable errors or visible warnings.
- [x] Same inputs produce stable scores, track results, and ordering.
- [x] Automated verification and stored-Figma acceptance pass.

## Verification commands

```sh
npm.cmd run verify:full
npm.cmd run test:coverage
npm.cmd run cli -- validate-config --examples
git diff --check
```

## Risks

Schema breadth can create accidental complexity. Mitigation: optional fields,
explicit defaults, cohesive domain types, and compatibility tests. Taxonomy
false positives can suppress valid adjacent roles; mitigation: title-first
families, boundary-aware phrases, required evidence, and negative fixtures.
Persistence volume grows by evaluated jobs per batch; mitigation: existing
5,000-candidate bound, one row per job/batch, cascade lifecycle, and no duplicate
per-track relational rows (bounded JSON evidence).

## Rollback considerations

Application behavior can revert to V1 while retaining the additive diagnostic
table. The migration is additive and historical batches remain readable.
Configuration extensions are optional, so existing valid files remain mappable.

## Unresolved questions

- Whether source policy should default to strict or preferred. Decision: strict
  for backward compatibility; tracked examples use `preferred`. Private source
  files must opt in explicitly, and no policy can manufacture a role match.
- Whether global maximum job experience remains. Decision: retain as an optional
  search-scope ceiling only when explicitly configured; semantic validation
  blocks it when below total candidate experience unless an intentional
  override flag is present.

## Implementation notes

- 2026-08-03: Completed the V1 path audit and recorded the concrete inflated
  defaults, forced-track behavior, experience contradiction, unused/zero-weight
  track component, and selected-only persistence limitation.
- 2026-08-03: Implemented Candidate Profile V2, role taxonomy, independent
  multi-track gates, Candidate Fit/Opportunity Quality scoring, cross-file
  validation, candidate exclusions, additive evaluation persistence, and local
  report diagnostics.
- 2026-08-03: Verified Node 22.22.0/npm 10.9.4 full, coverage, browser, and
  guarded PostgreSQL suites. A read-only replay over all 176 stored Figma jobs
  excluded Account Executive, matched Software Engineer, AI Product to `ai`,
  matched Developer Advocate to `marketing-devrel`, retained no-match reasons,
  and produced identical repeated evaluations.

## Final outcome

Complete. Candidate configuration now changes matching without source-specific
code; fundamental mismatches are gated before opportunity quality, and every
evaluated eligible job has bounded persisted diagnostics.
