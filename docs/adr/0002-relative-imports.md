# 0002: Use explicit relative imports

- **Status:** Accepted
- **Date:** 2026-07-29

## Context

The source tree has a small number of clear layers. Imports must resolve consistently in TypeScript, emitted ESM, Node.js, Vitest, and ESLint.

## Decision

Use explicit relative imports, including runtime-compatible `.js` extensions in TypeScript ESM source where needed.

## Consequences

Imports work without custom resolvers and make local dependencies visible. Deeply nested modules may eventually need longer paths, and moves can require import updates.

## Alternatives considered

- Package subpath imports: useful for larger stable modules, but premature now.
- TypeScript path aliases: rejected in [ADR 0003](0003-no-path-aliases.md).

Revisit this choice if nesting materially harms readability or stable package-level boundaries emerge with end-to-end resolver support.
