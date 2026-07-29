# 0001: Use Node.js 22 LTS

- **Status:** Accepted
- **Date:** 2026-07-29

## Context

The initial foundation used Node.js 24. The project needs one predictable runtime that is broadly available to contributors and supported by the current TypeScript, ESLint, Vitest, and Prisma toolchain.

## Decision

Support Node.js 22 LTS from version 22.13 through the end of the 22.x line. CI runs Node 22, `package.json` enforces `>=22.13.0 <23`, and Node type definitions follow major version 22.

Node 24 is not the baseline because adopting a newer major provides no foundation-level benefit and reduces compatibility with existing contributor environments.

## Consequences

Contributors use a mature LTS release and CI tests the declared major. Dependencies must retain Node 22 support. Features available only in later Node releases cannot be used.

## Alternatives considered

- Node 24: newer, but unnecessary for the current foundation.
- A multi-version CI matrix: adds cost without a commitment to support multiple majors.

Reconsider this decision when Node 22 approaches end of maintenance, a required dependency drops support, or a scoped feature needs a later runtime.
