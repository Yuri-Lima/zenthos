# ZenthOs

**Agent Operating System.** A ticket goes in; a specified, implemented, tested and reviewed merge request comes
out, with a human approving the spec and the risky steps. Built as a hexagonal core with pluggable adapters,
orchestrated by Temporal, traced and evaluated with LangFuse, and proven on two real codebases.

Status: phase 1. A ticket key starts a Temporal workflow that fetches the issue, has a LangGraph agent draft a
spec validated against the zod schema, posts it as a comment, and waits for a human to approve or reject by
label or CLI signal, with a timeout that escalates. Every model call is traced in LangFuse. Adapters: GitHub
issues, in-memory for dry runs. Tested with Temporal's time-skipping environment.

## Quick start

```bash
nvm use          # Node 24, from .nvmrc
corepack enable
pnpm install
cp .env.example .env
pnpm infra:up      # Temporal UI http://localhost:8080, LangFuse http://localhost:3100
pnpm check         # typecheck, lint, test
pnpm worker        # start the worker (dry run: in-memory tracker and spec writer)
pnpm cli run memory#1 && pnpm cli approve memory#1 && pnpm cli state memory#1   # the dry-run ticket
```

For a real run set `ISSUE_TRACKER=github`, `GITHUB_TOKEN`, `SPEC_WRITER=anthropic` and the LangFuse keys in
`.env`; the dev LangFuse keys from `.env.example` match the compose bootstrap. Model access needs no API key:
`ant auth login` on a laptop, workload identity federation in CI and the cloud. See
[docs/authentication.md](docs/authentication.md).

How the repo is organised and the rules for working in it: [AGENTS.md](AGENTS.md).
Why things are the way they are: [docs/adr](docs/adr).
