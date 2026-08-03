# Connection-bound network hardening

## Status

Complete. This blocking security pass fixed PRS-002 for HTTP and removed
PRS-003/PRS-020 from the controlled HTTP-only pilot exposure without contacting
real sources or broadening the product.

## Objective

Bind every production HTTP connection to an address that passed the conservative
URL/DNS policy, preserve TLS verification for the original hostname, and remove
external Chromium fallback from the controlled-pilot attack surface. Browser
rendering remains available only for explicit loopback fixtures in tests.

## Safety and scope

- Use injected DNS/transport behavior, synthetic responses, and loopback
  fixtures only.
- Do not print private source configuration or environment values.
- Do not add collectors, proxies, authentication, bypasses, application
  submission, hosted services, or dependencies.
- Preserve manual redirects, streaming byte limits, timeout, cancellation,
  retry, rate limiting, and collection-run semantics.
- Make configuration/readiness rejection happen before collection-run creation.

## HTTP design alternatives

### Design A: Node HTTP(S) request with a validated pinned lookup (chosen)

Resolve the normalized original hostname once through the injected resolver,
reject the hostname if **any** answer is non-public, normalize/deduplicate and
sort all allowed IPv4/IPv6 answers, and deterministically select the first.
Pass the original hostname to `http.request`/`https.request`, while a per-request
custom `lookup` callback returns only that selected address. Disable agent reuse
for each request.

- Connection-time enforcement: the actual socket lookup can return only the
  validated address; no second system DNS lookup occurs.
- Redirects and DNS rotation: every hop is parsed, resolved, validated, selected,
  and connected independently. A later DNS answer cannot affect an in-flight
  hop. Rotation is observed only on the next hop/request.
- TLS/SNI/certificates/Host: request hostname, TLS `servername`, certificate
  identity, and Host remain the original DNS hostname. The URL is never rewritten
  to an IP and `rejectUnauthorized` is never disabled.
- IPv4/IPv6/multiple records: both families are explicit. The all-address-safe
  policy fails closed if any answer is forbidden. Deterministic sorting avoids
  resolver-order nondeterminism.
- Reuse/proxies: `agent: false` prevents socket pooling and cross-policy reuse.
  Environment proxy variables are not interpreted by Node's request API.
- Cancellation/bytes: AbortSignal and one deadline cover connection and body
  consumption. The response is streamed into a fixed maximum buffer. Request
  advertises `Accept-Encoding: identity` and rejects encoded responses, avoiding
  hidden decompression expansion.
- Maintenance/portability/testability: standard Node 22 APIs, no new dependency,
  portable across Windows/Linux, and lookup/request behavior is injectable.

Cost: no keep-alive and deterministic-first address selection trade some
throughput/failover for a small, auditable V1 security boundary. If the selected
allowed address is unreachable the request fails; it does not silently re-resolve
or try an unvalidated address.

### Design B: Undici dispatcher/agent with a validated connect lookup

Use an Undici dispatcher whose connector lookup returns validated addresses and
pass it to Fetch per request/origin.

- Can preserve URL hostname, SNI, Host, certificate checks, redirects under the
  existing manual loop, IPv4/IPv6, cancellation, and streaming.
- Pooling could be origin-scoped, but dispatcher lifetime and DNS rotation must
  be carefully aligned with policy snapshots to prevent stale or cross-context
  sockets. Proxy dispatchers require separate proof.
- Fetch automatically decodes content encodings below the application stream,
  complicating compressed-versus-decompressed byte guarantees.
- Node's bundled Fetch dispatcher surface is not a portable DOM-typed contract;
  a direct Undici dependency would require a lockfile change under the declared
  Node/npm toolchain.

This design is viable but rejected for V1 because it has a larger dependency,
pooling, proxy, typing, and decompression verification surface.

## Browser design alternatives

### Design C: Disable external fallback; loopback fixtures only (chosen)

Runtime validation rejects enabled external generic sources whose fallback is
true or omitted. Readiness exposes a stable blocker code. The renderer itself
also requires test-loopback mode and an explicit loopback initial URL, so manual
composition cannot bypass configuration. All browser requests remain loopback,
methods/resources are restricted, service workers/WebSockets/downloads/
permissions/popups/child frames are blocked or bounded, and cleanup/deadlines
remain mandatory.

This fully removes PRS-002/PRS-020 browser exposure from the controlled
Greenhouse/Lever/generic-HTTP-only pilot. It deliberately does not claim that
external browser extraction is safe.

### Design D: Mandatory local interception proxy

Force Chromium through a local proxy that performs pinned DNS, TLS interception
or CONNECT policy, redirect and subresource checks, compressed/decompressed
budgets, request/frame/popup/WebSocket limits, and blocks all direct routes.

This could support external rendering, but secure certificate handling, proxy
bypass prevention, Chromium protocol coverage, per-context accounting, process
budgets, Windows/Linux behavior, and deterministic integration tests materially
exceed the V1 hardening scope. It is deferred rather than partially implemented.

## Error and readiness policy

- `URL_UNSAFE`: malformed scheme/credentials/destination or all-address policy
  rejection, without exposing resolved private addresses.
- `DNS_RESOLUTION_FAILED`: resolver failure or empty result.
- `HTTP_CONTENT_ENCODING_UNSUPPORTED`: transport refused encoded content because
  bounded decompression is not implemented.
- `BROWSER_FALLBACK_NOT_PERMITTED`: external/non-test browser rendering rejected.
- `BROWSER_FALLBACK_EXTERNAL_UNSAFE`: stable configuration/readiness code for an
  enabled external generic source with fallback true or omitted.

Configuration failure precedes collection and therefore creates no
`CollectionRun`. Network failures after a legitimate run begins retain existing
per-source and run failure persistence.

## Verification phases

1. Add failing unit/configuration/readiness regressions for pinned address
   selection, all-address rejection, redirects, case/trailing dot/mapped IPv6,
   resolver failure, browser rejection, and stable codes.
2. Implement the standard-library connection-bound transport and loopback-only
   renderer guard.
3. Add loopback HTTP integration coverage for bound connections, DNS change,
   redirects, body/timeout cancellation, and retry non-bypass; test TLS option
   contract without weakening certificate verification.
4. Update architecture, collector, browser, configuration, CLI, audit, risk, and
   pilot documentation after evidence is complete.
5. Run every command required by the hardening brief, including targeted
   security tests, browser, guarded PostgreSQL, coverage, audit, and
   `verify:full`.

## Readiness decision

`READY FOR CONTROLLED HTTP-ONLY PILOT` requires PRS-002 fixed, PRS-003/PRS-020
removed from pilot exposure through the enforced external-browser prohibition,
all security and aggregate gates green, and Node 22/npm 10 evidence. Those gates
passed locally under Node `v22.23.0` and npm `10.9.4`.

## Rollback

The transport, browser guard, validation/readiness changes, tests, and docs are
independently reviewable. No migration or persistent-data mutation is planned.
Revert the hardening commit as a unit if connection or TLS contract tests fail;
do not re-enable the prior unbound Fetch path as a pilot workaround.

## Progress log

- 2026-08-03: Completed mandated read-only inspection, confirmed no private real
  source is enabled without printing configuration, and selected Designs A/C
  after comparing Designs B/D.
- 2026-08-03: Added connection-bound HTTP(S), conservative all-address DNS
  validation, per-hop redirect/retry binding, safe content-encoding handling,
  and external-browser rejection with loopback-only fixture execution.
- 2026-08-03: Passed 97 targeted security tests, 246 ordinary tests, 6 browser
  tests, 18 guarded database tests, coverage thresholds, npm audit, CLI safety
  checks, and `verify:full` under Node 22/npm 10. Final restricted-pilot status:
  `READY FOR CONTROLLED HTTP-ONLY PILOT`.
