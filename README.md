# ZenthOs

**Agent Operating System.** A ticket goes in; a specified, implemented, tested and reviewed merge request comes
out, with a human approving the spec and the risky steps. Built as a hexagonal core with pluggable adapters,
orchestrated by Temporal, traced and evaluated with LangFuse, and proven on two real codebases.

Status: phase 0, the scaffold. The domain (run state machine, spec schema, gates, policies, metrics), the first
port with its contract test, the first use case and the in-memory adapter are in place with tests. Local
infrastructure for Temporal and LangFuse runs from one compose file.

## Quick start

```bash
nvm use          # Node 24, from .nvmrc
corepack enable
pnpm install
cp .env.example .env
pnpm infra:up      # Temporal UI http://localhost:8080, LangFuse http://localhost:3000
pnpm check         # typecheck, lint, test
```

How the repo is organised and the rules for working in it: [AGENTS.md](AGENTS.md).
Why things are the way they are: [docs/adr](docs/adr).
