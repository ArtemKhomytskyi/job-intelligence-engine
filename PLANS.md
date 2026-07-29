# Execution Plans

Use an execution plan for work that is multi-stage, crosses architectural boundaries, introduces a major dependency or data contract, carries meaningful migration risk, or cannot be understood safely from one focused change.

Create plans in `docs/exec-plans/` from `TEMPLATE.md`, using a descriptive kebab-case filename. A plan is a living implementation record, not an approval artifact: keep status, repository state, decisions, implementation notes, verification, unresolved questions, and final outcome synchronized as work proceeds. Someone unfamiliar with prior discussion should be able to execute or resume it.

Keep small fixes lightweight. A plan does not authorize broader scope, and discovered scope changes must be recorded and agreed before implementation.
