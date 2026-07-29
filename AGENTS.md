# Agent Instructions

## Purpose and phase

Job Intelligence Engine will become a local-first, explainable job-discovery application. This repository is in Chunk 0: engineering foundation. Chunk 0 contains no business logic. Do not add collectors, job or candidate models, scoring, recommendations, tracking, APIs, UI, or speculative interfaces unless a later scoped task explicitly authorizes them.

## Inspect and scope

Inspect the repository, working tree, applicable instructions, and relevant documentation before modifying anything. Preserve user changes. Do not silently broaden scope. State conflicts and report incomplete acceptance criteria honestly.

## Structure and dependency direction

- `domain`: pure business rules; depends on no outer layer.
- `application`: use cases and narrow ports; may depend on domain.
- `infrastructure`: adapters for databases and external systems; may depend inward.
- `interfaces`: delivery mechanisms; call application services.
- `shared`: stable, business-neutral utilities only.

The intended flow is `interfaces -> application -> domain`; infrastructure implements inward-owned abstractions. Domain must never import Prisma, framework, transport, filesystem, process, or network details. Avoid cycles and unnecessary barrel chains. Use explicit relative imports; do not introduce aliases without end-to-end tool support and a documented benefit.

## Design and coding conventions

Apply SOLID where code has real variation, but do not invent unused abstractions. Prefer small cohesive modules, composition, immutable data, deterministic pure behavior, dependency injection at boundaries, KISS, and YAGNI. Use strict TypeScript without `any`, `@ts-ignore`, broad disables, or weakened compiler checks.

Use `PascalCase` for types and classes, `camelCase` for values and functions, and descriptive kebab-case file names except conventional `index.ts` entry points. Export only intentional APIs. Avoid hidden global mutable state.

Fail fast at configuration boundaries with actionable errors. Preserve original causes when wrapping errors, do not swallow failures, and never expose secrets or personal data in messages or logs.

## Tests, docs, and dependencies

Tests must be deterministic, isolated, and use synthetic data. Add or update tests with behavior; do not require external services in unit tests. Update README and architecture or execution-plan documents whenever commands, behavior, contracts, or boundaries change.

Add a dependency only for a current, documented need. Prefer the standard library, use npm, update the lockfile, verify maintenance and license compatibility, and avoid unrelated upgrades. Architectural changes require explicit scope, updated architecture docs, and an execution plan when substantial. Large changes must use a living plan from `docs/exec-plans/TEMPLATE.md`.

## Security and privacy

Never hardcode candidate-specific data. Never commit `.env`, secrets, API keys, contact details, CVs, resumes, candidate profiles, cookies, browser sessions, personal data, generated application records, or reports. Use synthetic examples and keep local data in ignored paths.

## Mandatory completion checklist

Before finishing an implementation task:

- Review the final diff for scope, secrets, personal data, generated files, and accidental regressions.
- Run `npm run format:check`.
- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm test`.
- Run `npm run build`.
- Update tests and documentation where required.
- Report each unrun, failed, or incomplete criterion; never claim a check passed unless it ran successfully.

For foundation or database changes, also run `npm run prisma:validate`, `npm run prisma:generate`, `docker compose config`, and applicable database health checks.
