# Storage architecture

Chunk 2 persists already-produced job data; it does not collect, normalize, score, or select recommendations. Application-owned repository interfaces expose stable TypeScript DTOs. Prisma records, generated enums, Decimal values, and connection lifecycle remain in `src/infrastructure/persistence`.

## Relationships

- `JobSource` identifies one configured source. `JobSourceReference` links source identities and URLs to a canonical `Job`; deleting a source is restricted so it cannot erase jobs.
- `Job` owns exact `JobFingerprint` identities, ordered `JobRevision` records, and immutable `JobStatusHistory`. These tightly owned records cascade only when a job is explicitly deleted (primarily test cleanup).
- `CollectionRun` owns one `CollectionRunSourceResult` per source. Source deletion remains restricted while results exist.
- `JobScore` is historical and owns inspectable `ScoreComponent` rows. `Recommendation` references both the job and the exact score that produced the stored event.

Important identity and query fields are relational columns. JSONB is limited to structured locations/requirements/skills, non-identity metadata, explanation lists, collection errors, and compact revision before/after snapshots. Raw source payloads are not persisted by this chunk.

## Transactions and mapping

`PersistenceTransactionManager.execute` supplies one repository set backed by a single Prisma interactive transaction with a 10-second timeout. Application use cases define the boundary; repositories share the transaction client. Prisma errors become structured `PersistenceError` values, with causes retained but omitted from normal CLI output.

Mapping is explicit. PostgreSQL `timestamptz` becomes an ISO-8601 UTC string, Decimal becomes a number at the application boundary, JSON is recursively validated, and Prisma status enums are narrowed to domain status values. A failed mapping is `DATA_MAPPING_FAILED`; database records never escape infrastructure.

## Job identity and revisions

Upsert considers exact source/external ID, source URL, canonical URL, and the versioned exact fingerprint. Signals identifying different jobs produce `JOB_IDENTITY_CONFLICT`; there is no fuzzy merge. A second reference can link a new source to an existing canonical job.

The fingerprint is SHA-256 version 1 over NFKC-normalized, whitespace-collapsed, case-folded normalized company, normalized title, and canonical URL. Fingerprints are exact identity aids, not similarity scores.

Meaningful revision fields are title, company, description, canonical/application URLs, normalized title/company, locations, remote/employment/seniority values, salary, requirements, skills, publication/expiry timestamps, and metadata. Missing optional input preserves an existing non-null value. Seen/collection timestamps and status do not create revisions. `firstSeenAt` is immutable; later seen and collected timestamps advance monotonically.

## Status

Every job starts at `NEW` with an initial history entry. All domain statuses may be set explicitly; no speculative workflow restriction is imposed. A same-status request is unchanged. A real change updates `Job.currentStatus` and inserts history in the same transaction.

## Indexes and deletion

Unique constraints index configured source IDs, canonical URLs, source identities/URLs, fingerprint triples, revision sequence, score component keys, collection run/source pairs, and recommendation batch/job pairs. Additional indexes support status, normalized company/title, publication/collection time, revision/status history order, score history, recommendation ranking, and collection-run queries. Cascades are limited to records wholly owned by a job, score, or run; source references use restrictive deletion.
