# Deterministic scoring and recommendations

Eligible latest processing decisions are loaded with authoritative job status
and normalized payload in one bounded query. Each job is scored against every
enabled source-relevant track in memory. Highest final score wins; ties use
opportunity score and then track ID.

Component scores use 0–100, confidence uses 0–1, and external values round to
four decimals. Contribution is `score * weight / 100`; twelve configured weights
total 100. `trackMatch` is a zero-weight explanatory component. Unavailable
evidence normally scores a neutral 50 with confidence 0.25 and a stable missing
key. The absence of a mandatory education or language requirement is mildly
favorable (80 with confidence 0.7) but still records that the requirement was
not stated. Confidence never multiplies score. Final score is the sum of
contributions. Opportunity is `55% final + 15% freshness + 10% salary + 10%
application destination + 10% source quality`. Component reasons retain their
deterministic evidence order; top-level positives and concerns are deduplicated
and ordered by code and message.

Selection fills per-track quotas in track-ID order, then a shared fallback pool.
Minimum score, company/title caps, APPLIED/SKIPPED exclusion, and the requested
limit always apply. Unfilled quota slots fall back to the shared pool. Ordering
is final score, opportunity, freshness, completeness, then job ID. Chunk 5
comparison keys provide company and title grouping. Missing company values use
separate groups unless `unknownCompanyJobsShareCap` requests a shared unknown
group; missing titles always use separate job-specific groups.

The CLI captures evaluation time once. The unique batch hash includes that time,
limit, configuration fingerprint, processing decisions/revisions, and statuses.
Persistence is one transaction; concurrent identical runs reuse the winner.
