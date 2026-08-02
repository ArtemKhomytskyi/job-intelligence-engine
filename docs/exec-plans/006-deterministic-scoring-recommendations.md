# Deterministic scoring and recommendations

- **Status:** Implemented; final verification in progress
- **Owner:** Project contributors
- **Last updated:** 2026-07-30

## Objective

Score eligible normalized jobs against every enabled search track, select the
winning track deterministically, apply diversity constraints, and persist an
explainable recommendation batch without introducing online or probabilistic
scoring.

## Design

Component scores use 0–100, confidence uses 0–1, and persisted arithmetic is
rounded to four decimal places. The existing twelve weights total 100.
`trackMatch` is an explanatory zero-weight component so existing weight files
remain compatible. Final score is the sum of weighted contributions.

Opportunity score is distinct: 55% final match, 15% freshness, and 10% each for
salary, application destination, and source quality. Confidence is reported
separately and never silently multiplies scores. Reasons use stable codes and
explicit impacts; missing data receives a neutral score of 50 with confidence
0.25 and a machine-readable missing-data key.

The selector first fills configured track quotas in track-ID order, then uses a
common fallback pool. Every candidate remains subject to minimum score,
APPLIED/SKIPPED exclusion, normalized company and title caps, and the requested
hard limit. Ordering is final score, opportunity score, freshness, completeness,
then job ID. Input order and randomness never affect results.

## Implementation status

Domain scoring and selection, application orchestration, transactional Prisma
persistence, the forward-only migration, CLI delivery, unit/integration/database
tests, configuration wiring, and documentation are implemented. Final status is
determined by the mandatory verification commands, including the guarded local
PostgreSQL suite when `TEST_DATABASE_URL` is present in the same process.
