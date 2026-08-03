# Multi-ATS benchmark and performance

The committed regression corpus is deterministic and synthetic, as required by the repository privacy and isolation policy. It generates 1,200 jobs across ten role families and validates lossless shared ATS mapping without network or candidate data. Provider fixtures separately cover every discovery fingerprint and collector adapter.

Live validation is deliberately separate: private `config/sources.yaml` and the local PostgreSQL database may be used for controlled provider pilots, but real job payloads, company-specific reports, and generated records are never committed. A live acceptance run must record companies attempted, providers discovered, total jobs, duplicates, failures, elapsed time, peak process memory, and jobs/minute. It must also spot-check unchanged Extraction V2 and recommendation behavior. No live result is claimed unless that run actually executes.

The scheduler has a global source bound (1–8), a default same-provider bound of two, hostname rate limiting, isolated retries, stable output order, and sequential per-source persistence. Conditional requests use ETag and Last-Modified when a prior public response supplied them. Memory remains bounded by configured response-size limits and each source's candidate set; current collectors do not stream listings into persistence.
