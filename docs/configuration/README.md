# Configuration

Job Intelligence Engine reads four YAML files from `config` by default. Tracked examples document the contract; private copies hold local preferences.

| Private file   | Tracked example        | Contents                                    |
| -------------- | ---------------------- | ------------------------------------------- |
| `profile.yaml` | `profile.example.yaml` | Candidate information independent of tracks |
| `search.yaml`  | `search.example.yaml`  | Tracks and global search preferences        |
| `scoring.yaml` | `scoring.example.yaml` | Explicit scoring weights totaling 100       |
| `sources.yaml` | `sources.example.yaml` | Strict source definitions                   |

Private filenames are ignored by Git. Example files are tracked and contain fictional, non-sensitive data.

## Start from the examples

PowerShell:

```powershell
Copy-Item config/profile.example.yaml config/profile.yaml
Copy-Item config/search.example.yaml config/search.yaml
Copy-Item config/scoring.example.yaml config/scoring.yaml
Copy-Item config/sources.example.yaml config/sources.yaml
```

POSIX shells:

```sh
cp config/profile.example.yaml config/profile.yaml
cp config/search.example.yaml config/search.yaml
cp config/scoring.example.yaml config/scoring.yaml
cp config/sources.example.yaml config/sources.yaml
```

Validate the private copies:

```sh
npm run cli -- validate-config
```

Validate tracked examples without creating private files:

```sh
npm run cli -- validate-config --examples
```

Use `--config-dir <path>` for another directory, `--json` for structured output, and `--help` for usage. `--examples` changes only the deterministic filenames; normal loading never falls back to examples.

## Profile fields

`candidate` requires a safe `id`, `displayName`, experience summary, education, skills, languages, citizenships, work authorizations, preferred employment types, and location. `totalYearsExperience` supplies the numeric experience evidence used by scoring. Headline, summary, institution, city, skill experience, and total experience are optional. Country codes use two uppercase letters and language codes use two or three lowercase letters.

Do not store contact details, CV contents, credentials, passport data, street addresses, or other unnecessary personal information.

## Search fields

Each track defines its ID, name, enabled state, target titles, keyword lists, preferred skills and industries, priority, and optional positive recommendation quota. Enabled quotas together cannot exceed `dailyRecommendationLimit`.

Preferences define countries, remote policies, relocation, company sizes, employment types, exclusions, experience and optional salary ranges, minimum score, the daily limit, and per-company maximum. Minimum range values cannot exceed maximums. Relocation countries require `willingToRelocate: true`.

`preferences.hardFilters` configures allowed countries/groups, unknown location/industry/language-level policies, maximum seniority and mandatory experience, mandatory-PhD policy, company/industry/title exclusions, removable URL tracking parameters, and legal company suffixes. Exclusion phrases are literal values, never regular expressions. Older private search files without this object receive permissive defaults; copy the explicit example block to customize processing.

## Scoring fields

The twelve weight keys shown in `scoring.example.yaml` are required; unknown keys are rejected. Values are non-negative percentages and must sum exactly to 100. Each contribution is `component score * weight / 100`, and the final score is the sum of contributions on a 0-100 scale.

`settings.titleAliases` and `settings.skillAliases` define explicit canonical forms; duplicate canonical or alias values are rejected. Experience tolerance is a non-negative year count. The freshness horizon must be greater than the full-score window. Source-quality values are 0-100. Selector title caps must be positive integers, and company caps come from search preferences. Track quotas are positive integers attached directly to known tracks, so an unknown quota reference cannot be represented; their enabled total cannot exceed the daily limit. Invalid salary ranges, score ranges, caps, weights, and quotas fail validation rather than being repaired.

## Source fields

Every source has a safe unique ID, discriminator, enabled state, display name, tags, and track IDs. Empty `trackIds` means the source is not restricted to specific tracks.

Public ATS sources may also set `company`, `requestTimeoutMs` (1000-60000), and `requestsPerSecond` (greater than 0 and at most 10). Collection defaults to the display name, 15000 ms, and two requests per second.

- `greenhouse`: `boardToken` and optional valid `boardUrl`.
- `lever`: `companySlug` and optional valid `jobsUrl`.
- `generic-page`: public HTTPS `url` plus optional browser timeout, link/depth limits, and browser fallback flag.
- `generic-job-list`: the same settings, with a default traversal depth of one.
- `generic-jsonld`: retained as a configuration-only legacy discriminator; use `generic-page` for collection.

Generic browser timeouts must be 3000-90000 ms, discovered-link limits 1-200, and traversal depth 0-2. Defaults are 15000 ms, 50 links, browser fallback enabled, and depth zero (`generic-page`) or one (`generic-job-list`).

Source validation performs no requests. LinkedIn is not supported. If sources later need secrets, environment-variable references require a separate design; do not store secrets directly in YAML.

Collect enabled sources with `npm run cli -- collect`. Use repeatable `--source <id>`, `--type greenhouse|lever|generic-page|generic-job-list`, `--concurrency 1..8`, `--config-dir`, `--verbose`, and `--json`. Partial source failures return 0 with a partial summary; configuration/arguments return 2, database initialization/finalization returns 3, and a wholly failed or cancelled run returns 4.

Process stored jobs with `npm run cli -- process`. Use `--limit 1..10000` (default 1000), `--config-dir`, `--verbose`, and `--json`. Configuration/argument errors return 2, database/run persistence errors return 3, and a wholly failed processing run returns 4. See the [processing architecture](../architecture/job-processing.md) for exact reason and unknown-data semantics.

Create and persist a recommendation batch with `npm run cli -- recommend --limit 20`. The default limit is 20 and the accepted range is 1-1000. `--json` returns the complete persisted score breakdown; normal output includes the batch identity, evaluation time, ordered jobs, selected tracks, final and opportunity scores, brief reason codes, and missing-data counts. An empty result is successful and explicit. Configuration/argument errors return 2 and database or persistence errors return 3. See the [scoring architecture](../architecture/scoring-recommendations.md).

## Errors

Validation reads every file and reports multiple useful issues where practical. Each issue contains a stable code, section, message, and available file or field path. Normal CLI output does not include stack traces, parsed configuration, raw payloads, or retained error causes.

Successful example output is:

```text
Configuration valid
Candidate: Artem
Enabled tracks: 5
Enabled sources: 3
Daily recommendation limit: 20
```
