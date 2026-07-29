# Agent Instructions

## Purpose and phase

Job Intelligence Engine will become a local-first, explainable job-discovery application. Chunk 4 provides configuration, PostgreSQL persistence, ATS collectors, and bounded generic web extraction. Filtering and scoring algorithms, recommendation selection, APIs, and UI remain out of scope unless a later task explicitly authorizes them.

## Inspect and scope

Before editing, inspect the working tree, applicable instructions, code, and relevant documentation. Preserve user changes, keep work within the requested scope, and surface material conflicts.

## Structure and dependency direction

- `domain`: pure business rules; depends on no outer layer.
- `application`: use cases and narrow ports; may depend on domain.
- `infrastructure`: adapters for databases and external systems; may depend inward.
- `interfaces`: delivery mechanisms; call application services.
- `shared`: stable, business-neutral utilities only.

The intended flow is `interfaces -> application -> domain`; infrastructure implements inward-owned abstractions. Domain must never import Prisma, framework, transport, filesystem, process, or network details. Avoid cycles and unnecessary barrel chains. Use explicit relative imports; do not introduce aliases without end-to-end tool support and a documented benefit.

Configuration follows `filesystem read -> YAML parse -> Zod validation -> domain mapping -> cross-file validation`. Persistence follows `application use case -> application-owned transaction/repository ports -> Prisma adapter -> PostgreSQL`. Zod, YAML, Prisma, and I/O stay in infrastructure or outer composition.

## Design and coding conventions

Apply SOLID where code has real variation; avoid speculative abstractions. Prefer small cohesive modules, composition, immutable data, deterministic behavior, and dependency injection at boundaries. Keep strict TypeScript intact: no `any`, `@ts-ignore`, broad disables, or weakened checks.

Use `PascalCase` for types and classes, `camelCase` for values and functions, and descriptive kebab-case file names except conventional `index.ts` entry points. Export only intentional APIs. Avoid hidden global mutable state.

Fail fast at configuration boundaries with actionable errors. Preserve original causes when wrapping errors, do not swallow failures, and never expose secrets or personal data in messages or logs.

## Tests, docs, and dependencies

Tests must be deterministic, isolated, and use synthetic data. Update tests with behavior and keep unit tests independent of external services. Update relevant documentation when commands, behavior, contracts, or boundaries change.

Dependencies need a current, documented purpose. Prefer the standard library, use npm, update the lockfile, and avoid unrelated upgrades. Substantial architectural changes require updated architecture documentation and a living plan based on `docs/exec-plans/TEMPLATE.md`.

## Security and privacy

Use synthetic examples. Do not hardcode or commit candidate-specific data, `.env`, secrets, API keys, contact details, CVs, resumes, profiles, cookies, browser sessions, personal data, generated application records, or reports. Keep local data in ignored paths.

## Mandatory completion checklist

Before finishing an implementation task:

- Review the final diff for scope, secrets, personal data, generated files, and accidental regressions.
- Run `npm run format:check`.
- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm test`.
- Run `npm run build`.
- Confirm tests and documentation match the change.
- Report every unrun, failed, or incomplete criterion; claim a check passed only when it was executed successfully.

For foundation or database changes, also run `npm run prisma:validate`, `npm run prisma:generate`, `docker compose config`, and applicable database health checks.

For domain or configuration changes, also run `npm run test:coverage` and `npm run cli -- validate-config --examples`.

For storage changes, also apply migrations to the guarded test database and run `npm run test:db`; never bypass the localhost and test-database-name checks.
