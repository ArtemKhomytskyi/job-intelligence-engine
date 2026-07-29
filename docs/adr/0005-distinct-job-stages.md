# 0005: Keep raw and normalized job stages distinct

- **Status:** Accepted
- **Date:** 2026-07-29

## Context

Collectors need to preserve source fidelity, while later filtering and scoring need structured values. One large job interface with many nullable raw and normalized fields would make stage guarantees unclear.

## Decision

Use `RawJobPosting` for collector output, `JobPosting` for shared descriptive concepts, and `NormalizedJobPosting` for composition of a shared job with normalized fields and traceability. Raw payload and metadata values are JSON-compatible.

## Consequences

Pipeline stages state what they accept and produce, and downstream modules do not parse arbitrary collector objects. Mapping between stages will be explicit in later chunks. Some descriptive fields appear in closely related contracts, but their stage semantics remain clear.

## Alternatives considered

- One universal job interface: rejected because widespread optionality obscures invariants.
- Class inheritance: rejected because stage conversion is data transformation, not substitutable specialization.
- Collector-specific domain subclasses: rejected because infrastructure types would leak inward.
