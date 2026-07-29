# 0003: Do not use path aliases

- **Status:** Accepted
- **Date:** 2026-07-29

## Context

TypeScript path aliases do not rewrite emitted ESM imports. They would require aligned configuration or rewriting across TypeScript, Node.js, Vitest, ESLint, and the production build.

## Decision

Do not configure path aliases in the current foundation. Use the explicit relative imports described in [ADR 0002](0002-relative-imports.md).

## Consequences

The project avoids resolver-specific behavior and extra tooling. Some future imports may become verbose as the source tree grows.

## Alternatives considered

- TypeScript `paths` alone: rejected because successful type-checking would not guarantee runtime resolution.
- A runtime alias loader or build rewrite: rejected as unnecessary dependency and configuration overhead.

Aliases may become justified when real module depth causes repeated readability problems and one tested strategy covers development, tests, linting, emitted ESM, and runtime execution.
