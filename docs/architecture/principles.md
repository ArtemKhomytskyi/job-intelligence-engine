# Engineering principles

- **Single responsibility:** collection, normalization, evaluation, persistence, and presentation will change for different reasons and belong in separate modules.
- **Open/closed and substitution:** when real variation exists, narrow ports should let a new source or output adapter replace another without changing domain decisions.
- **Interface segregation and dependency inversion:** use cases should request only the capabilities they need, and technology adapters should depend on those inward-owned contracts.
- **KISS and YAGNI:** implement the smallest current behavior. Chunk 0 therefore has boundary markers, not fake services or domain entities.
- **DRY with clarity:** share stable concepts, not coincidentally similar source-specific behavior.
- **Composition over inheritance:** assemble collectors, policies, and adapters at boundaries; avoid rigid implementation hierarchies.
- **Explicit boundaries:** translate external data before it enters domain logic and keep configuration loading separate from evaluation.
- **Determinism and explainability:** given the same normalized input and configuration, future filtering and scoring should produce the same result and expose the reasons.
- **Testability:** pure core behavior and injected adapters should allow most tests to run without networks, browsers, or PostgreSQL.
- **Privacy by design:** minimize personal data, keep it local by default, exclude it from version control, and avoid leaking it through diagnostics.
- **Configuration over hardcoding:** future candidate preferences and policies belong in validated user configuration, never source constants or fixtures containing real data.
