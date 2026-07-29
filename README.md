# Job Intelligence Engine

Job Intelligence Engine is an open-source, local-first project intended to make job discovery configurable, explainable, and private. The repository is currently **engineering foundation only**: job collection, candidate profiles, filtering, scoring, recommendations, application tracking, APIs, and user interfaces are not implemented.

## Goals

- Establish a strict, testable TypeScript codebase with explicit architectural boundaries.
- Provide reproducible npm, PostgreSQL, Prisma, Docker Compose, and CI workflows.
- Keep future personal job-search data local by default and out of version control.

The current phase deliberately contains no business logic or speculative domain schema.

## Technology

Node.js 24 or newer, npm, TypeScript, PostgreSQL 17, Prisma, Vitest, ESLint, Prettier, Docker Compose, and GitHub Actions.

## Get started

Prerequisites are Node.js 24+, npm 10+, and Docker with Compose.

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

`npm run verify` runs every gate above. `npm run prisma:format` formats the schema.

## Repository layout

- `src/domain`: future pure business concepts.
- `src/application`: future use-case coordination and ports.
- `src/infrastructure`: future database and external-system adapters.
- `src/interfaces`: future user-facing delivery mechanisms.
- `src/shared`: narrowly scoped, business-neutral utilities.
- `prisma`: PostgreSQL datasource and client generator; no models yet.
- `tests`: deterministic tests, beginning with a foundation smoke test.
- `docs/architecture`: project-specific boundaries and engineering principles.
- `docs/exec-plans`: process and template for substantial changes.

Imports use explicit relative paths. Path aliases are deferred because they would require synchronized TypeScript, test, lint, and runtime resolution with no present benefit.

## Development

Keep changes scoped, add tests for behavior, update relevant documentation, and run `npm run verify` before opening a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md), the [architecture overview](docs/architecture/overview.md), [dependency rules](docs/architecture/dependency-rules.md), and [execution-plan guidance](PLANS.md).

Never commit candidate information, CVs or resumes, contact details, credentials, cookies, sessions, generated application records, or reports. Local-first is a privacy boundary as well as a deployment choice.

Licensed under the [Apache License 2.0](LICENSE).
