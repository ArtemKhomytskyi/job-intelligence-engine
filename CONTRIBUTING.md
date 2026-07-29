# Contributing

## Prepare the environment

Install Node.js 24+, npm 10+, and Docker with Compose. Run `npm install`, copy `.env.example` to `.env`, and use `npm run db:up` when database work requires PostgreSQL.

## Make a change

- Create a focused branch and keep the pull request limited to one coherent concern.
- Inspect existing code and documentation before editing them.
- Add or update deterministic tests for changed behavior and update documentation when behavior, commands, or architecture change.
- Use Conventional Commits such as `feat:`, `fix:`, `docs:`, `test:`, or `chore:` with a concise imperative subject.
- Explain the intent, verification, risks, and any incomplete criteria in the pull request.

Dependency changes must have a concrete need. Prefer the standard library, inspect maintenance and license implications, install with npm, and commit the resulting `package-lock.json`. Do not bundle unrelated upgrades.

Propose cross-layer or architectural changes in an issue or design discussion before implementation. Large, risky, or multi-stage work requires a living execution plan based on `docs/exec-plans/TEMPLATE.md`.

## Verify

Run:

```sh
npm run verify
docker compose config
```

For database changes, also start PostgreSQL and confirm its health. Report commands that were not executed or did not pass.

## Security and privacy

Never commit secrets, `.env`, API keys, authentication sessions, browser cookies, CVs, resumes, candidate profiles, email addresses, telephone numbers, private source data, generated reports, or application records. Use synthetic data in tests and documentation.
