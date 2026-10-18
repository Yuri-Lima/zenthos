# ZenthOs

**Agent Operating System.** A ticket goes in; a specified, implemented, tested and reviewed merge request comes
out, with a human approving the spec and the risky steps. Built as a hexagonal core with pluggable adapters,
orchestrated by Temporal, traced and evaluated with LangFuse, and proven on two real codebases.

Status: phase 3 in progress. A ticket key starts a Temporal workflow that fetches the issue, has a LangGraph agent draft a
spec validated against the zod schema, posts it as a comment, and waits for a human to approve or reject by
label or CLI signal. After approval, Claude Code implements the spec headless in a fresh clone where only the
repository profile's commands may run; deterministic gates (forbidden paths, diff budget, secret scan, cost
ceiling, then the repo's own lint and checks) decide whether a pull request opens against the base branch, with
one retry that feeds the failed gates back to the agent. A LangGraph reviewer then scores the open pull request
against a four-line rubric and posts the scores and findings as a comment; below the threshold the agent gets
one more round with the findings, and humans always merge. Regression evals built from the repository's merged
history score both agents and block a prompt change that lowers them. A REST API keeps provider connections and
repository profiles in Postgres with secrets sealed at rest, connects GitHub through the App manifest flow, and
takes the App's webhook so a label starts or decides a run without polling. Every run transition is recorded to
Postgres, so the API lists runs after the workflow is gone. Every model call is traced in LangFuse. Tested with
Temporal's time-skipping environment, a local bare git remote, and fakes for the agent.

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
pnpm studio        # LangGraph Studio: open https://smith.langchain.com/studio?baseUrl=http://localhost:2024 (free LangSmith login)
pnpm api           # REST API on :3200, OpenAPI at /docs
pnpm dashboard     # Angular dashboard on :4200; with ZENTHOS_AUTH=github it asks you to sign in with GitHub
```

For a real run set `ISSUE_TRACKER=github`, `GITHUB_TOKEN`, `SPEC_WRITER=anthropic` and the LangFuse keys in
`.env`; the dev LangFuse keys from `.env.example` match the compose bootstrap. Model access needs no API key:
`ant auth login` on a laptop, workload identity federation in CI and the cloud. See
[docs/authentication.md](docs/authentication.md).

How the repo is organised and the rules for working in it: [AGENTS.md](AGENTS.md).
Why things are the way they are: [docs/adr](docs/adr).
