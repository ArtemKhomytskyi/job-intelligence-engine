# Collectors

Greenhouse and global Lever use connection-bound public JSON requests. Generic
web sources use connection-bound bounded static HTML extraction. External
browser fallback is disabled; Playwright exists only for explicit loopback test
fixtures. All collectors return application-owned candidates to the same
normalization, orchestration, and persistence path.

See [generic web extraction](generic-web.md) and the [collection architecture](../architecture/collection.md).
