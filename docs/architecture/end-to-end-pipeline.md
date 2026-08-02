# End-to-end pipeline

`RunFullPipeline` is the single application-level orchestration used by both
`npm run cli -- run` and web `POST /actions/run`.

```text
load and validate configuration
  → collect and persist source/job/run results
  → normalize, deduplicate, hard-filter, and persist decisions
  → score eligible jobs, select diversity-aware recommendations
  → atomically persist the immutable recommendation batch
```

The outer composition injects existing `CollectionOrchestrator`,
`ProcessCollectedJobs`, and `CreateRecommendations` services behind narrow
ports; their algorithms are not copied. Application orchestration contains no
CLI output, HTTP objects, Prisma calls, YAML, environment reads, or HTML.

The run captures one evaluation time. Collection and processing retain their
injected stage clocks; scoring and batch identity use the captured time. The
orchestration completion clock is also injected.

Partial collection success proceeds. Fully failed/cancelled collection stops
processing; failed/cancelled processing stops recommendations. Empty eligible
sets and recommendation batches are successful. Recommendation persistence
remains one transaction, so components, scores, and recommendations cannot
leave a partial batch.

Existing run and batch records provide latest pipeline state. Chunk 7 adds no
redundant `PipelineRun` table or migration. Historical pages therefore label
batch reuse “Not recorded historically”; the immediate CLI summary reports the
actual reuse result.
