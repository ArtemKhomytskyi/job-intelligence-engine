# Job Intelligence Engine

Job Intelligence Engine is intended to become a local-first tool for collecting and evaluating job opportunities with user-controlled configuration and explainable results. The repository currently contains only the engineering foundation. Job collection, candidate profiles, filtering, scoring, recommendations, application tracking, APIs, and user interfaces are not implemented.

## Goals

- A strict TypeScript build with explicit architectural boundaries.
- Reproducible npm, PostgreSQL, Prisma, Docker Compose, and CI workflows.
- Local handling of future personal job-search data by default.

The current phase deliberately contains no business logic or speculative domain schema.

## Technology

Node.js 22 LTS, npm, TypeScript, PostgreSQL 17, Prisma, Vitest, ESLint, Prettier, Docker Compose, and GitHub Actions.

## Get started

Use Node.js 22 LTS, version 22.13 or newer, and npm 10 or newer. Docker with Compose is needed only for the local PostgreSQL service.

```sh
npm install
```

Copy `.env.example` to `.env`. Its `DATABASE_URL` must use the same user, password, database, and exposed port as the `POSTGRES_*` values.

```sh
npm run db:up
docker compose ps
npm run verify
```

Tests do not require PostgreSQL. Prisma validation and generation require `DATABASE_URL`, but do not connect to the database. Common database commands are:

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
npm run prisma:validate
npm run prisma:generate
npm run build
```

`npm run verify` runs formatting, linting, type-checking, tests, Prisma validation and generation, and the build. Coverage remains a separate explicit check. `npm run prisma:format` formats the schema.

## Repository layout

- `src/domain`: future pure business concepts.
- `src/application`: future use-case coordination and ports.
- `src/infrastructure`: future database and external-system adapters.
- `src/interfaces`: future user-facing delivery mechanisms.
- `src/shared`: narrowly scoped, business-neutral utilities.
- `prisma`: PostgreSQL datasource and client generator; no models yet.
- `tests`: deterministic tests, beginning with a foundation smoke test.
- `docs/architecture`: project-specific boundaries and engineering principles.
- `docs/adr`: accepted architecture decisions and their trade-offs.
- `docs/exec-plans`: process and template for substantial changes.

Imports use explicit relative paths. The rationale and conditions for reconsidering this are recorded in the [architecture decisions](docs/adr/README.md).

## Development

Keep changes scoped, add tests for behavior, update relevant documentation, and run `npm run verify` before opening a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md), the [architecture overview](docs/architecture/overview.md), [dependency rules](docs/architecture/dependency-rules.md), and [execution-plan guidance](PLANS.md).

npm scripts are the canonical cross-platform interface. No Makefile is provided because wrappers would duplicate these short commands; Windows contributors do not need Make.

Never commit candidate information, CVs or resumes, contact details, credentials, cookies, sessions, generated application records, or reports. Local-first is a privacy boundary as well as a deployment choice.

Licensed under the [Apache License 2.0](LICENSE).
