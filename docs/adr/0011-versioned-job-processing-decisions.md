# 0011: Process versioned stored job snapshots without destructive merging

- **Status:** Accepted
- **Date:** 2026-07-29

## Context

Collection already performs boundary normalization and upserts jobs by strong identity signals. Raw external payloads are intentionally not stored. Normalization, duplicate review, and hard filters nevertheless need reproducible decisions, reprocessing after revisions or configuration changes, and full provenance.

## Decision

Chunk 5 processes the current stored `Job` plus its latest revision number. Revision zero identifies the initial observation. One immutable processing decision is keyed by job, input revision, normalization version, fingerprint version, filter version, and relevant configuration fingerprint. Queryable current normalized fields remain on `Job`; decision evidence, issues, and all filter reasons are stored with processing history.

Existing source/external ID, canonical URL, and exact v1 fingerprint upsert semantics remain authoritative. Canonical application URL may confirm duplicates among remaining records. Company/title/location equality is only possible-duplicate evidence. A versioned processing fingerprint may confirm a duplicate only when an exact non-empty normalized description is present; it also distinguishes employment type, remote/location scope, department, and office. Possible duplicates retain up to 20 stable candidate IDs with evidence, remain filterable, and are retained for later scoring policy, while confirmed duplicates skip hard filtering. Records are never deleted or silently merged.

## Consequences

The design adapts to actual persisted data and is idempotent without inventing unavailable raw payloads. Strong identities resolved during collection cannot appear as separate Chunk 5 duplicate decisions, but their references and revisions remain preserved by the existing model. Configuration changes produce new decisions rather than reusing stale results.

## Alternatives

- Adding retroactive raw-payload storage was rejected because historical payloads do not exist and collection intentionally discards them.
- Replacing existing upsert identity was rejected because it would weaken established constraints and revision behavior.
- Automatically merging composite matches was rejected because same-title openings can be distinct.
