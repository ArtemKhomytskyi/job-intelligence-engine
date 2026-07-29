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

`candidate` requires a safe `id`, `displayName`, experience summary, education, skills, languages, citizenships, work authorizations, preferred employment types, and location. Headline, summary, institution, city, and skill experience are optional. Country codes use two uppercase letters and language codes use two or three lowercase letters.

Do not store contact details, CV contents, credentials, passport data, street addresses, or other unnecessary personal information.

## Search fields

Each track defines its ID, name, enabled state, target titles, keyword lists, preferred skills and industries, priority, and optional positive recommendation quota. Enabled quotas together cannot exceed `dailyRecommendationLimit`.

Preferences define countries, remote policies, relocation, company sizes, employment types, exclusions, experience and optional salary ranges, minimum score, the daily limit, and per-company maximum. Minimum range values cannot exceed maximums. Relocation countries require `willingToRelocate: true`.

## Scoring fields

All keys shown in `scoring.example.yaml` are required; unknown keys are rejected. Values are non-negative percentages and must sum to 100. Weights express configuration only and are not applied until a later scoring chunk.

## Source fields

Every source has a safe unique ID, discriminator, enabled state, display name, tags, and track IDs. Empty `trackIds` means the source is not restricted to specific tracks.

Public ATS sources may also set `company`, `requestTimeoutMs` (1000-60000), and `requestsPerSecond` (greater than 0 and at most 10). Collection defaults to the display name, 15000 ms, and two requests per second.

- `greenhouse`: `boardToken` and optional valid `boardUrl`.
- `lever`: `companySlug` and optional valid `jobsUrl`.
- `generic-jsonld`: valid `url`.
- `generic-page`: valid `url`.

Source validation performs no requests. LinkedIn is not supported. If sources later need secrets, environment-variable references require a separate design; do not store secrets directly in YAML.

Collect enabled Greenhouse and Lever sources with `npm run cli -- collect`. Use repeatable `--source <id>`, `--type greenhouse|lever`, `--concurrency 1..8`, `--config-dir`, `--verbose`, and `--json`. Partial source failures return 0 with a partial summary; configuration/arguments return 2, database initialization/finalization returns 3, and a wholly failed or cancelled run returns 4.

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
