# 0007: Use versioned exact SHA-256 job fingerprints

- **Status:** Accepted
- **Date:** 2026-07-29

## Context

Source IDs and URLs can overlap across feeds. Persistence needs deterministic exact identity while future matching strategies may evolve.

## Decision

Use SHA-256 version 1 over normalized company, normalized title, and canonical URL after Unicode normalization, whitespace collapse, and case folding. Store fingerprint, algorithm, version, and kind in a dedicated unique table. Treat fingerprints only as exact matches.

## Consequences

Repeated inputs are deterministic and one job can retain future fingerprint versions. Changing identity inputs requires a new version. Similar jobs are not merged.

## Alternatives considered

- Unversioned hash on `Job`: rejected because algorithm evolution would overwrite identity history.
- Fuzzy matching: explicitly deferred because thresholds and false merges are business behavior outside storage.
