# Generic extraction tests

Unit fixtures cover JSON-LD objects, arrays and graphs, malformed block isolation, semantic extraction, HTML cleanup, link selection, ATS detection, app-shell decisions, block pages, URL safety, resource policy, and normalization. Controlled HTTP tests cover redirects and list-to-detail traversal. Browser tests cover real local JavaScript execution. The PostgreSQL suite covers extraction through normalization, collection orchestration, and durable storage.

All data and hosts are synthetic. Network-facing production behavior is not exercised by the default test suite. Run `npm test`, `npm run test:browser`, and the guarded database workflow described in [database-tests.md](database-tests.md).
