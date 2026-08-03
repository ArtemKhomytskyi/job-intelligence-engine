# Deterministic job processing

Chunk 5 processes the current persisted `Job` snapshot and latest revision number. Collection already resolves source/external ID, canonical source URL, and the existing exact v1 fingerprint, so processing does not recreate or retain raw source payloads.

## Pipeline

`ProcessCollectedJobs` loads at most 10,000 jobs in stable `lastCollectedAt, id` order. Each job is normalized with `normalization-v2`, classified by duplicate evidence, evaluated by `hard-filters-v1` when not a confirmed duplicate, and persisted in a per-job transaction. One content problem does not stop other jobs; a persistence failure that prevents recording the error fails the run.

Normalization is pure and offline. It preserves original title, company, URLs,
description, dates, and locations while deriving comparison keys, seniority,
remote scope, explicit requirements, technology categories, authorization, and
salary structure. Description parsing is bounded to 100,000 characters and uses
five enriching layers: structured source fields, semantic HTML, section
detection, bullet analysis, and sentence rules. Facts carry bounded evidence and
optional deterministic source/strategy/confidence provenance. Static
ATS normalization preserves heading-to-list boundaries, and a list-scoped
section ends before unrelated prose so later compensation or boilerplate does
not inherit a qualification label. Static
country/language/technology aliases and safe fixed regular expressions are used;
there is no geocoding, fetching, browser use, arbitrary source regex, fuzzy
matching, currency conversion, annualization, external API, or LLM.

`descriptionAnalysis` in the versioned normalized JSON payload contains
certifications, benefits, responsibilities, required/preferred/nice-to-have
qualifications, employment and contract evidence, travel, remote policy,
sponsorship, clearance, relocation, and compensation mentions. Existing
experience, education, language, skill, authorization, employment, location,
and salary fields are enriched from the same analysis so filters and scoring do
not need a new contract. See the [extraction pipeline audit](../audits/extraction-pipeline-audit.md).

Salary parsing prefers collector-provided structured amounts. Optional `metadata.salaryText` is parsed only when it contains an explicit EUR/USD/GBP code or euro/dollar/pound symbol; unparseable text is preserved with `UNPARSEABLE_SALARY`. Employment type and ISO timestamps use the validated collector/storage contract rather than guessing from prose. Date-only parsing and arbitrary salary prose are intentionally unsupported.

## Duplicate confidence

Layers are evaluated in this order:

1. Source plus external ID is authoritative in collection storage and is also checked defensively in a processing batch.
2. Equal canonical application URLs confirm a duplicate.
3. Equal company, title, and location keys produce `POSSIBLE_DUPLICATE`, not a merge.
4. Equal versioned processing fingerprints confirm a duplicate only when both
   records have a non-empty normalized description. Sparse records therefore
   remain unique or possible duplicates rather than being over-merged.

The SHA-256 v1 payload has fixed keys for company, title, location (including
remote scope), employment type, department, office, and exact bounded
description. Serialization sorts object keys, represents missing optional
values as `null`, normalizes strings with NFKC, and uses UTF-8. URLs and
timestamps are excluded. The oldest `firstSeenAt`, then lexicographically
smallest ID, is primary, independent of repository return order. Map indexes
make classification O(n * K), where `K` is the fixed evidence limit of 20.
Every selected weak candidate ID retains matching evidence in stable primary
order; additional weak candidates are deterministically truncated.

Possible duplicates are filtered and retained with their own status for a later scoring policy; they are not counted as eligible in this chunk. Confirmed duplicates skip hard filters. No job is deleted or silently merged.

## Hard filters and reprocessing

Filters always run in documented order and collect every reason: `COUNTRY_NOT_ALLOWED`, `WORK_AUTHORIZATION_NOT_AVAILABLE`, `MISSING_REQUIRED_LANGUAGE`, `SENIORITY_EXCEEDS_MAXIMUM`, `EXPERIENCE_EXCEEDS_MAXIMUM`, `PHD_REQUIRED`, `EXCLUDED_COMPANY`, `EXCLUDED_INDUSTRY`, `EXCLUDED_TITLE_PATTERN`, and `JOB_EXPIRED`. Expiry is inclusive: `expiresAt <= processing time` is expired. Preferred or optional requirements never reject. Unknown location, industry, and candidate language-level behavior follows configuration.

The idempotency key is job ID, latest revision number, normalization version,
fingerprint version, filter version, and a SHA-256 fingerprint of relevant
candidate/filter configuration. Set-like configuration arrays are sorted;
display-only candidate fields are excluded. An identical rerun skips the job.
A changed revision or relevant version/configuration creates a new immutable
decision. Creation uses PostgreSQL conflict skipping so concurrent runs cannot
overwrite decision history. Current normalized fields and the complete
normalized payload are also stored on `Job` for later querying; nullable current
fields are cleared when a later decision no longer derives them.

Each run loads at most the requested bounded batch. Existing decision keys are
loaded in one batch query; a fully unchanged batch is skipped without
normalizing or fingerprinting descriptions. When any decision is pending, all
loaded records are normalized because they are needed as comparison candidates,
and only missing decisions are written. The run summary
separately reports considered, normalized, failed, duplicate, possible,
rejected, eligible, error, and skipped counts. A run-level failure after run
creation is recorded as `FAILED`; cancellation is recorded as `CANCELLED`.

Run with `npm run cli -- process`, optionally adding `--limit 1..10000`, `--config-dir`, `--verbose`, or `--json`. No dry-run or force option is exposed because their persistence/history semantics are not required in this chunk.
