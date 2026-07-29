# Dependency rules

## Permitted

- Domain may use the TypeScript/JavaScript language and pure, technology-neutral value modules.
- Application may import domain and define narrow ports required by use cases.
- Infrastructure may import application and domain contracts to implement adapters.
- Interfaces may call application services and may compose infrastructure at an outer entry point.
- Shared may be imported only when its content is business-neutral and does not reverse dependency direction.

## Forbidden

- Domain must not import Prisma, database records, Node-specific I/O, transport types, frameworks, environment access, or infrastructure.
- Application must not depend on concrete infrastructure implementations.
- Collectors must not control scoring or reporting, and reporting must not query job sources directly.
- Configuration loading must not be mixed into business evaluation.
- External payloads and Prisma models must not be used as domain models.
- Circular imports, cross-layer shortcuts, universal interfaces, and chains of barrel re-exports are prohibited.

Use explicit relative imports for now. See [ADR 0002](../adr/0002-relative-imports.md) and [ADR 0003](../adr/0003-no-path-aliases.md).

Code review and documentation enforce these rules in Chunk 0. When enough real modules exist to justify it, focused ESLint restrictions or architecture tests may enforce layer paths and cycles. Add that tooling only through a scoped change with tests and documented false-positive handling.
