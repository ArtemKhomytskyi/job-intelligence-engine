# Job Intelligence Engine

Job Intelligence Engine is intended to become a local-first tool for collecting and evaluating job opportunities with user-controlled configuration and explainable results. The repository currently provides domain contracts, strict YAML configuration validation, and a local validation CLI. Collection, normalization algorithms, filtering, scoring calculations, recommendations, persistence, APIs, and UI are not implemented.

## Goals

- A strict TypeScript build with explicit architectural boundaries.
- Reproducible npm, PostgreSQL, Prisma, Docker Compose, and CI workflows.
- Local handling of future personal job-search data by default.

The current phase defines contracts and validation only; it contains no collection, filtering, scoring, recommendation, or persistence algorithms.

## Technology

Node.js 22 LTS, npm, TypeScript, Zod, YAML, PostgreSQL 17, Prisma, Vitest, ESLint, Prettier, Docker Compose, and GitHub Actions.

## Get started

Use Node.js 22 LTS, version 22.13 or newer, and npm 10 or newer. Docker with Compose is needed only for the local PostgreSQL service.

```sh
npm install
```

Validate the safe tracked examples:

```sh
npm run cli -- validate-config --examples
```

To use private configuration, copy the four `config/*.example.yaml` files to their corresponding `config/*.yaml` names, edit the private copies, and run `npm run cli -- validate-config`. See the [configuration guide](docs/configuration/README.md) for fields, commands, and error behavior.

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

- `src/domain`: pure domain contracts, categorical types, and range invariants.
- `src/application`: configuration orchestration, ports, cross-file rules, and errors.
- `src/infrastructure`: filesystem, YAML, Zod, and schema-to-domain adapters.
- `src/interfaces`: local CLI parsing and output.
- `src/shared`: narrowly scoped, business-neutral utilities.
- `prisma`: PostgreSQL datasource and client generator; no models yet.
- `tests`: deterministic unit, integration, CLI, and foundation tests.
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
