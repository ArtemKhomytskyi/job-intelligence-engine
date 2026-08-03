# Domain model and configuration system

- **Status:** Complete
- **Owner:** Project contributors
- **Last updated:** 2026-07-29

## Objective

Define the first stable domain contracts and provide a local, YAML-based configuration system with strict validation, structured errors, tracked examples, and a `validate-config` CLI command.

## Background

The repository currently has only the Chunk 0 engineering foundation. Later collection, filtering, scoring, and recommendation work needs shared vocabulary and validated configuration, but none of that later behavior belongs in this chunk.

## Current repository state

The branch is `feature/chunk-1-domain-config`, the initial working tree is clean, and the Node 22 ESM TypeScript foundation passes its quality pipeline. The domain, application, infrastructure, and interface directories contain only boundary markers. Prisma has no business models.

## Scope

- Domain contracts for candidates, search tracks and preferences, scoring configuration, source configuration, job pipeline stages, score results, and recommendations.
- Meaningful categorical types and range/percentage value objects.
- Four strict YAML configuration schemas, parsing, mapping, and cross-file validation.
- Filesystem-backed loading through application-owned ports.
- Structured configuration errors and deterministic CLI output.
- Safe, mutually consistent example configuration.
- Unit, integration, CLI, architecture, and usage documentation updates.

## Non-goals

Collection, network access, persistence, Prisma business models, normalization algorithms, filtering, score calculation, recommendation selection, application tracking, APIs, UI, authentication, secret management, and deployment changes.

## Architectural constraints

Dependencies remain `interfaces -> application -> domain`. Infrastructure implements application-owned reading and decoding ports. Domain modules import neither Node APIs nor Zod/YAML. External unknown data is narrowed at the infrastructure boundary. Explicit relative ESM imports remain in use.

## Affected modules

- `src/domain`: pure contracts, categories, and invariant-enforcing value-object factories.
- `src/application/configuration`: bundle, ports, loader, validation, summary, and errors.
- `src/infrastructure/configuration`: filesystem access, YAML parsing, strict Zod schemas, and mapping.
- `src/interfaces/cli`: argument parsing, composition, output formatting, and exit-code mapping.
- `config`: tracked examples; explicit private-file ignore rules.

## Interfaces and data contracts

Application owns a narrow `ConfigFileReader` port and `ConfigurationDecoder` port. The loader produces `ConfigurationBundle`. User-facing failures contain one or more `ConfigurationIssue` values with stable code, section, path, and optional file path; retained causes are not rendered.

Scoring weights use explicit component keys and must total 100. Source configuration is a discriminated union. Job stages use composition rather than inheritance. JSON-compatible metadata and raw payload types prevent arbitrary infrastructure objects from leaking inward.

## Implementation sequence

1. Define domain categories, value objects, and contracts.
2. Define application bundle, ports, structured errors, loader, summary, and cross-file rules.
3. Add strict Zod schemas, YAML parsing, filesystem reading, and schema-to-domain mapping.
4. Add valid example YAML files and private-file ignore rules.
5. Compose the built-in Node argument parser CLI without a CLI framework.
6. Add unit, integration, and CLI tests.
7. Update architecture, configuration, contributor, README, and agent documentation.
8. Run every required verification and privacy check; resolve failures at their source.

## Error handling

Known file, YAML, schema, reference, duplicate, weight, and range failures become structured configuration issues. Multiple read/schema/cross-file issues are aggregated where practical. Unexpected failures remain distinguishable as `CONFIG_INTERNAL_ERROR`. Normal CLI output omits stack traces, causes, and configuration contents.

## Observability considerations

This local validation command needs deterministic stdout/stderr and exit codes only. No telemetry, logging framework, or network reporting is introduced.

## Security and privacy considerations

Tracked examples use fictional, non-sensitive data. Private YAML filenames are ignored explicitly. Errors show paths and messages but never dump parsed documents, source payloads, secrets, or personal records. Secret references are deferred to a later scoped design.

## Testing strategy

Unit tests cover value-object invariants, strict schemas, cross-file rules, error mapping, summaries, and output. Integration tests use temporary directories for successful example loading and representative file/YAML/schema/range failures. A subprocess test exercises `npm run cli -- validate-config --examples`. Tests require no database, Docker, network, environment secrets, or private files.

## Documentation updates

Add `docs/architecture/domain-model.md` and `docs/configuration/README.md`; update README, AGENTS, CONTRIBUTING, architecture overview, dependency rules, and ADR index. Add meaningful ADRs for boundary validation and distinct raw/normalized job stages.

## Acceptance criteria

- [x] All required domain contracts and categorical types compile without outer-layer dependencies.
- [x] Examples contain five enabled tracks, three enabled sources, recommendation limit 20, and an explicitly synthetic candidate name.
- [x] Strict YAML/Zod validation and cross-file rules return structured, useful errors.
- [x] Default CLI uses private files; `--examples` validates tracked examples in a clean clone.
- [x] Required unit and integration scenarios pass deterministically.
- [x] Private configuration is ignored while examples remain trackable.
- [x] Documentation matches behavior and architecture.
- [x] All required verification commands pass.

## Verification commands

```sh
npm install
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run prisma:validate
npm run prisma:generate
npm run build
npm run verify
npm run cli -- validate-config --examples
npm ls --depth=0
npm audit
git diff --check
```

## Risks

- Over-modeling future behavior: mitigate by keeping contracts descriptive and omitting algorithms and persistence identities.
- Schema/domain drift: map explicitly and test examples plus schema rejection.
- Poor error usability: aggregate stable issues and test rendered output without exposing raw input.
- CLI/build coupling: keep npm scripts canonical and compile before invoking the ESM entry point without adding a runtime TypeScript dependency.

## Rollback considerations

Changes are additive except documented updates, dependency additions, scripts, and ignore rules. Reverting this chunk restores the foundation without database migration or external-state rollback.

## Unresolved questions

- None. The specification fixes the example counts, weight total, source types, and CLI contract sufficiently for implementation.

## Implementation notes

- 2026-07-29: Confirmed clean working tree and branch `feature/chunk-1-domain-config`.
- 2026-07-29: Chose built-in Node argument parsing and build-before-run CLI to avoid Commander or a runtime TypeScript dependency.
- 2026-07-29: Scoring weights will be explicit percentages totaling 100; range factories enforce reusable domain invariants.
- 2026-07-29: Implemented pure domain contracts, application-owned ports and validation, strict YAML/Zod adapters, safe examples, CLI composition, and 32 passing tests before documentation completion.
- 2026-07-29: Added ADRs for boundary validation and distinct raw/normalized job stages; no framework or unrelated dependency was introduced.
- 2026-07-29: Expanded the final suite to 40 tests, including missing/unreadable/malformed/schema/range/reference/source/track/weight cases and the exact npm CLI subprocess.
- 2026-07-29: Final coverage passed at 96.15% statements, 82.11% branches, 95.91% functions, and 96.08% lines. `npm audit` reported zero vulnerabilities.
- 2026-07-29: Verified private filenames are ignored, examples are not ignored, no private/generated paths are staged, and no credential or email patterns occur in tracked work.

## Final outcome

Completed the scoped domain and configuration foundation. The example CLI prints an explicitly synthetic candidate name, five enabled tracks, three enabled sources, and a daily limit of 20. All requested npm, test, coverage, Prisma, build, CLI, dependency, audit, formatting, and diff checks passed. No network collection, persistence model, algorithm, API, UI, secret management, or other later-chunk behavior was added.
