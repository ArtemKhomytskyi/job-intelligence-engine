# 0012: Persist immutable recommendation batches by deterministic input hash

- **Status:** Accepted
- **Date:** 2026-07-30

## Context

Scoring must be reproducible, concurrent identical runs must not create partial
or conflicting ranks, and historical recommendations must remain inspectable.

## Decision

One `RecommendationBatch` owns a run. Its unique SHA-256 input hash covers the
captured evaluation timestamp, requested limit, relevant configuration
fingerprint, eligible job IDs, processing-decision IDs, revision numbers, and
authoritative statuses. The winning transaction creates the batch, selected
historical scores, components, and ranked recommendations atomically. A
concurrent loser returns the committed batch. Different evaluation timestamps
intentionally create immutable history.

Only the winning track score is persisted; non-winning track scores are transient.

## Consequences

Database uniqueness provides concurrency safety, rank is unique within a batch,
and no partial batch survives rollback.
