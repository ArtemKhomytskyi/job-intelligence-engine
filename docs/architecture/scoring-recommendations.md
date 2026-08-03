# Deterministic candidate matching and recommendations

Eligible latest processing decisions are loaded with authoritative status and
normalized Extraction V2 evidence in one bounded query. Each job is evaluated
independently against every enabled track permitted by its source policy. A
track is valid only when its title or canonical role family matches and all
required evidence, mandatory candidate concepts, excluded evidence, and
acceptable-seniority rules pass. Evaluation never assigns the first available
track. If none passes, the result is `NO_VALID_TRACK_MATCH`; all track
evaluations and exact evidence remain persisted.

Role analysis normalizes punctuation, aliases and geographic/work-mode suffixes,
extracts seniority, and applies an ordered role-family taxonomy. Exact primary,
secondary, adjacent and exploratory candidate titles score 100, 90, 75 and 60.
Canonical role-family alignment scores 70. Track validity is calculated
separately, preventing a candidate preference from making an unrelated track
valid. Explicit title, phrase, family, skill and evidence exclusions gate the
match before opportunity quality is considered.

Scoring V2 exposes two dimensions. Candidate Fit uses title (30%), valid track
alignment (25%), skills (20%), relevant experience (15%), location (4%), work
authorization (3%), and language (3%). Opportunity Quality uses freshness
(35%), salary evidence (20%), direct application simplicity (20%), and source
quality (25%). A valid final score is 80% Candidate Fit and 20% Opportunity
Quality. An invalid match is capped below 40, so freshness or a trusted source
cannot compensate for zero candidate relevance. Missing evidence scores zero
with low confidence; absent mandatory education/language requirements use a
neutral 50 rather than a reward. Values round to four decimals and ordering is
stable.

Experience compares a job's mandatory minimum and track requirement with the
candidate's matching role-family years. Total career experience is used only
for legacy profiles without role-family experience. The configured tolerance
produces explicit met, acceptable small-gap, and larger-gap reasons. Global and
candidate seniority ceilings remain processing hard filters; per-track
acceptable seniorities gate track matching.

Only valid scores at or above `max(global minimum, track minimum)` enter the
diversity selector. Selection fills per-track quotas in track-ID order, then a
shared fallback pool. Company/title caps, APPLIED/SKIPPED exclusion and the
requested limit always apply. Ordering is final score, opportunity, freshness,
completeness, then job ID.

The CLI captures evaluation time once. The unique batch hash includes time,
limit, configuration fingerprint, processing decisions/revisions and statuses.
Persistence is transactional and concurrent identical runs reuse the winner.
Every evaluated eligible job persists its outcome, threshold, Candidate Fit,
Opportunity Quality, final score, selected/best track, all alternative track
evaluations, concrete positive/negative/missing evidence, and exact selector or
threshold reason. Historical selected-only batches remain readable.
