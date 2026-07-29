# 0009: Keep collection contracts and resilience policy inward-owned

- Status: Accepted
- Date: 2026-07-29

## Context

The first collection path must support multiple ATS adapters without coupling use cases to Fetch, Prisma, console output, or vendor response types.

## Decision

The application layer owns collector, HTTP, logging, time, cancellation, and persistence ports plus orchestration and normalized candidates. Infrastructure implements fixed Greenhouse and Lever adapters and composes timeout, retry, and per-source rate limiting around Fetch. Descriptions are stored as deterministic plain text. Source work is bounded concurrently and job persistence is sequential.

## Consequences

Collectors and resilience behavior are deterministic under tests, source failures remain isolated, and domain code has no transport dependency. Vendor response changes are contained in adapters. Conservative normalization intentionally leaves uncertain fields absent.
