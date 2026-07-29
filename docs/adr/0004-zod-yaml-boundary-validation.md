# 0004: Validate YAML with Zod at the infrastructure boundary

- **Status:** Accepted
- **Date:** 2026-07-29

## Context

Configuration enters as untrusted YAML. Domain and application code need stable typed values without depending on file formats or validation libraries.

## Decision

Infrastructure parses YAML to `unknown`, validates strict per-file Zod schemas, and explicitly maps schema output to domain contracts. Application owns reading/decoding ports, aggregation, cross-file validation, and structured errors. Domain modules import neither YAML nor Zod.

## Consequences

Unknown keys and invalid source variants fail at the boundary, while inner layers remain technology-independent. Explicit mapping adds code but prevents schema types from silently becoming domain models. User errors can retain library causes internally without exposing them in CLI output.

## Alternatives considered

- Validate inside domain modules: rejected because it couples core contracts to Zod and YAML concerns.
- Use TypeScript assertions after parsing: rejected because assertions provide no runtime safety.
- Hand-written validation: rejected because complete nested issue collection would be larger and harder to maintain.
