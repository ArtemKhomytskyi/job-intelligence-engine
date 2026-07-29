# Domain model

Chunk 1 defines contracts for later pipeline stages without implementing those stages.

## Candidate and search configuration

`CandidateProfile` contains reusable, non-track-specific candidate information: display details, education, experience summary, skills, languages, work authorization, employment arrangements, and relocation context. `SearchTrack` describes one career direction independently of candidate identity. `SearchPreferences` holds constraints shared across tracks.

IDs use lowercase letters, numbers, and single hyphens. Track and source IDs are unique. At least one track and one source must be enabled.

## Scoring configuration

`ScoringConfig` has twelve explicit component weights. Each weight is a percentage from 0 through 100, and all weights must total exactly 100. This chunk validates the contract but performs no score calculation.

Future `ScoreResult` values use a 0–100 scale for total score, component raw score, contribution, and completeness. Components retain their reasons so results can remain explainable.

## Source configuration

`SourceConfig` is a discriminated union for `greenhouse`, `lever`, `generic-jsonld`, and `generic-page`. Common fields cover identity, enablement, tags, and optional track restrictions; each discriminator has strict settings. These are data contracts only—no network behavior exists.

## Job stages

`RawJobPosting` preserves collector-provided strings, dates, and a JSON-compatible payload without exposing collector classes. `JobPosting` is the shared descriptive job concept. `NormalizedJobPosting` composes a `JobPosting` with canonical and normalized fields plus source traceability. These stages are distinct so downstream code never needs to infer whether a field is raw or normalized.

Dates are represented as ISO-8601 strings at these boundaries. Metadata and raw payloads are constrained to JSON-compatible values. Salary and experience factories enforce non-negative, ordered ranges. No normalization, filtering, scoring, recommendation selection, or persistence behavior is implemented.

`Recommendation` connects a normalized job and score result with rank, generation time, and explanation. It intentionally contains no application-tracking state or database identity.
