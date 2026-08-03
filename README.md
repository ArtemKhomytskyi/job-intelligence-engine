# Job Intelligence Engine

Job Intelligence Engine is a local-first application for collecting, processing, scoring, and recommending job opportunities with user-controlled configuration and explainable results. It provides strict company/source configuration, deterministic discovery for ten ATS providers, PostgreSQL persistence, bounded parallel and incremental collection, generic HTML extraction, versioned normalization, conservative deduplication, hard filters, deterministic scoring, diversity-aware recommendation selection, and a local server-rendered report for application tracking.

## Goals

- A strict TypeScript build with explicit architectural boundaries.
- Reproducible npm, PostgreSQL, Prisma, Docker Compose, and CI workflows.
- Local handling of future personal job-search data by default.

The current phase also scores eligible normalized jobs against enabled tracks and persists immutable recommendation batches with full component breakdowns.

## Technology

Node.js 22 LTS, npm, TypeScript, Zod, YAML, PostgreSQL 17, Prisma, Cheerio, Playwright Chromium, Vitest, ESLint, Prettier, Docker Compose, and GitHub Actions.

## Get started

Use Node.js 22 LTS, version 22.13 or newer, and npm 10 or newer. Docker with Compose is needed only for the local PostgreSQL service.

```sh
npm install
```

Validate the safe tracked examples:

```sh
npm run cli -- validate-config --examples
```

To use private configuration, copy the four `config/*.example.yaml` files to
their corresponding `config/*.yaml` names and edit the Git-ignored copies. The
tracked source file is documentation only: all templates are disabled and its
placeholder URLs and ATS identifiers must be replaced before enabling a source.

```sh
npm run cli -- sources:check
npm run cli -- validate-config
```

See the [configuration guide](docs/configuration/README.md) for fields,
commands, and error behavior.

Copy `.env.example` to `.env`. Its `DATABASE_URL` must use the same user, password, database, and exposed port as the `POSTGRES_*` values.

```sh
npm run db:up
docker compose ps
npm run playwright:install
npm run verify
```

Unit tests do not require PostgreSQL. Apply the committed storage migration and check database health/status with:

```sh
npm run prisma:migrate:deploy
npm run cli -- db:check
npm run cli -- db:status
npm run cli -- sources:check
npm run cli -- collect --json
npm run cli -- discover-all
npm run cli -- health
npm run cli -- process --limit 1000 --json
npm run cli -- recommend --limit 20 --json
npm run cli -- run
npm run cli -- serve
```

The final two commands are the normal V1 workflow after at least one real source
is enabled. `run` executes the complete
pipeline; `serve` validates configuration/database connectivity and starts the
local report at [http://127.0.0.1:3000](http://127.0.0.1:3000). It supports
recommendation filters/sorts/details, persisted score explainability, safe
descriptions and direct apply links, VIEWED/APPLIED/SKIPPED tracking, latest run
state, a first-run setup page, and a guarded manual full-pipeline action. `serve`
may start before source setup is complete so instructions remain available at
`/setup`; collection cannot start from that state. See the [CLI guide](docs/cli.md),
[local report architecture](docs/architecture/local-web-report.md), and
[end-to-end pipeline architecture](docs/architecture/end-to-end-pipeline.md).

Common service commands are:

```sh
npm run db:logs
npm run db:down
docker compose down --volumes
```

The final command removes all local database data and should only be used for an intentional reset.

## Quality commands

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run test:browser
npm run prisma:validate
npm run prisma:generate
npm run build
npm run test:db
```

`npm run verify` runs formatting, linting, type-checking, database-independent tests, Prisma validation and generation, and the build. `npm run verify:full` additionally runs isolated Chromium fixtures, applies migrations to the guarded `TEST_DATABASE_URL`, and runs real PostgreSQL tests. Coverage remains a separate explicit check. See the [processing architecture](docs/architecture/job-processing.md), [scoring and recommendation architecture](docs/architecture/scoring-recommendations.md), [generic collector guide](docs/collectors/generic-web.md), [database guide](docs/database/README.md), and [database-test guide](docs/testing/database-tests.md).

## Repository layout

- `src/domain`: pure domain contracts, categorical types, and range invariants.
- `src/application`: configuration, collection, and persistence use cases with inward-owned ports.
- `src/infrastructure`: filesystem, ATS/HTTP, logging, and Prisma adapters.
- `src/interfaces`: CLI and local HTTP delivery, lifecycle, and dependency composition.
- `src/shared`: narrowly scoped, business-neutral utilities.
- `prisma`: PostgreSQL schema and committed storage migrations.
- `tests`: deterministic unit/integration tests plus a separately invoked PostgreSQL suite.
- `docs/architecture`: project-specific boundaries and engineering principles.
- `docs/configuration`: detailed configuration and CLI reference.
- `docs/adr`: accepted architecture decisions and their trade-offs.
- `docs/exec-plans`: process and template for substantial changes.

Imports use explicit relative paths. The rationale and conditions for reconsidering this are recorded in the [architecture decisions](docs/adr/README.md).

## Development

Keep changes scoped, add tests for behavior, update relevant documentation, and run `npm run verify` before opening a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md), the [architecture overview](docs/architecture/overview.md), [dependency rules](docs/architecture/dependency-rules.md), and [execution-plan guidance](PLANS.md).

npm scripts are the canonical cross-platform interface. No Makefile is provided because wrappers would duplicate these short commands; Windows contributors do not need Make.

Never commit candidate information, CVs or resumes, contact details, credentials, cookies, sessions, generated application records, or reports. Local-first is a privacy boundary as well as a deployment choice.

Licensed under the [Apache License 2.0](LICENSE).
