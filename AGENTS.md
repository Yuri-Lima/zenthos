# ZenthOs

ZenthOs, the Agent Operating System, turns a ticket into a specified, implemented, tested and reviewed merge
request with human checkpoints. A hexagonal core, Temporal orchestration, LangGraph agents, LangFuse evals.
Proven on two real codebases: Legal Connect first, Phoenix ERP second.

This file is the single source of truth for working in the repo. `CLAUDE.md` points here. Cursor reads this
file directly. Do not duplicate its content elsewhere; link to it.

## Engineering rules

These win over any pattern below when the two conflict. The goal is a codebase a new engineer reads in an afternoon.

1. **Readability first.** Prefer the obvious version over the clever one. A function fits on one screen.
2. **One source of truth per concept.** Constants, schemas, route names, config keys, enum values and error codes
   are defined once and imported. The zod schema is the type: derive TypeScript types from it, never hand-write a
   parallel interface. The run state machine (`libs/domain/src/lib/run-state.ts`) is the only definition of
   states and transitions.
3. **No boilerplate, no duplication.** Search for a helper before writing one. Two similar blocks become one
   function only when they are the same concept. Generated code is never hand-edited.
4. **Avoid complex operations.** No nested ternaries, no clever reduce chains, no decorators beyond what NestJS
   and Temporal need. Async flows read top down with `await`.
5. **Abstractions only when necessary.** A port exists only when a second adapter is real or planned in the
   roadmap. No factories, registries, generic base classes or plugin loaders until a concrete second use forces them.
6. **Fail loud and early.** Validate at the boundary with zod, then trust the data. Errors carry a code from
   `ERROR_CODES` in `libs/domain/src/lib/errors.ts`.
7. **Every task ends with an evaluation pass.** Before calling work done, check performance (hot paths, N+1
   calls, unbounded lists), code quality (rules 1 to 6, lint and typecheck clean, tests for behaviour) and memory
   (unsubscribed streams, unclosed clients, listeners, unbounded maps and caches, references held across retries).
8. **Document decisions, not code.** One ADR per non-obvious choice in `docs/adr`. Comments explain why.
9. **Measure before optimizing.** A performance claim comes with a number from a trace or benchmark.
10. **Safety defaults.** No destructive git in any sandbox. Migrations and production paths need a human approval
    signal. Cost ceilings are enforced per run. No stored API keys: model access comes from an OAuth profile on a
    laptop and from workload identity federation in CI and the cloud (`docs/authentication.md`).

## Layout

| Path | Holds | Depends on |
| --- | --- | --- |
| `libs/domain` | Entities, run state machine, zod schemas, gates, policies, metrics, error codes | nothing but zod and node |
| `libs/ports` | One interface per adapter family, each with a `*.contract.ts` test | domain |
| `libs/application` | One file per use case | domain, ports |
| `libs/adapters/*` | One library per concrete adapter: `in-memory` (tests and dry runs), `github` (issues and pull requests), `langfuse` (tracing callbacks), `git-sandbox` (a clone per run with the command allowlist), `claude-code` (headless Claude Code with the same allowlist) | domain, ports |
| `libs/agents` | LangGraph graphs that implement agent ports. Spec writer: draft, validate against the schema, retry with the errors | domain, ports, LangChain |
| `libs/evals` | Golden dataset and regression runner for the agents (phase 3) | domain, ports, agents |
| `apps/worker` | Temporal worker: `workflows.ts` (one workflow per ticket), `activities.ts` (thin, call use cases), `config.ts` (zod-validated env), `repos.ts` (the repository profiles: clone URL, base branch, allowed and gate commands, policy) | anything |
| `apps/cli` | `zenthos run|approve|reject|state <ticket-key>` against the running worker | anything |
| `docs/adr` | Architecture decision records | |
| `infra/` | Files mounted by `docker-compose.yml` | |

The ESLint rule `@nx/enforce-module-boundaries` in `eslint.config.mjs` enforces the "Depends on" column and
bans vendor SDKs inside domain, ports and application. Every project carries a `scope:*` tag in its
`package.json`; a new library must have one or lint rejects it.

## Conventions

- ESM everywhere. Relative imports end in `.js` even for `.ts` files (TypeScript `nodenext`).
- Cross-library imports use the package name (`@zenthos/domain`), never a relative path across libraries.
- A new dependency goes into the library's own `package.json` (`pnpm --filter @zenthos/<lib> add <pkg>`), then
  `pnpm nx sync` updates the TypeScript references.
- Tests sit next to the code as `*.spec.ts` and test behaviour, not implementation. An adapter spec runs the
  port's contract against its own fixture (see `libs/adapters/in-memory`).
- A new target repository is one entry in `apps/worker/src/repos.ts`. Allowed commands are exact lines; a gate
  command must be one of them (ADR 005).
- Temporal workflow code stays deterministic; I/O lives in activities that call use cases. Workflow code may
  import `@zenthos/domain` (pure) and nothing with node or vendor imports; `apps/worker/src/bundler.ts` resolves
  the workspace sources for the workflow bundle.
- Agent graphs take a LangChain `Runnable` as the model and are tested with `RunnableLambda` fakes (ADR 004).
- Prompts carry a version string (`SPEC_WRITER_VERSION`); bump it when the wording changes.
- No API keys in the repo or in CI. Model access comes from an `ant auth login` profile on a laptop and from
  Workload Identity Federation elsewhere; GitHub access from a GitHub App; `docs/authentication.md` has both.
  Claude Code's claude.ai login is for a developer's own laptop only; shared deployments give the coding agent
  the deployment's credentials (ADR 005).
- Model cost on a run is `estimatedCostUsd`, an estimate at list price, kept beside the reported token counts.
  Never present it as a bill.
- The pipeline acts on GitHub only through installation tokens; a signed-in user's token identifies the person
  and never does the bot's work (ADR 007).
- Provider connections and repository profiles are configuration the product will own (ADR 006). Until the
  tables and the settings page exist, the only two sources are `githubCredentials()` in the worker config and
  `apps/worker/src/repos.ts`; add nothing credential-shaped anywhere else.

## Commands

```bash
pnpm install
pnpm infra:up          # Temporal (7233, UI on 8080) and LangFuse (3100) in Docker
pnpm check             # typecheck + lint + test for every project
pnpm nx run-many -t typecheck
pnpm nx run-many -t lint
pnpm nx run-many -t test
pnpm worker           # Temporal worker, dry run by default (ISSUE_TRACKER=memory, SPEC_WRITER=memory)
pnpm cli run owner/repo#123
pnpm cli approve owner/repo#123
pnpm cli state owner/repo#123
pnpm nx run @zenthos/worker:contract -- owner/repo#123   # live GitHub check: comment, commit attribution, cleanup
pnpm nx run @zenthos/worker:review -- owner/repo#123 spec.json   # re-review the open pull request of a run (ADR 008)
pnpm nx g @nx/js:lib libs/adapters/<name> --importPath=@zenthos/adapter-<name> --tags=scope:adapter --bundler=tsc --linter=eslint --unitTestRunner=jest --minimal
```

Jest configs are `jest.config.cjs` (plain CommonJS) because Jest cannot load `.cts` configs under TypeScript 6.

## Roadmap

Phases 0 to 2 are in: scaffold; intake, spec draft and human decision; implementation by Claude Code in a git
sandbox, deterministic gates with one feedback retry, and a pull request to the base branch. Phase 3 in
progress: the reviewer scores the pull request against the domain rubric and posts a comment, a failed review
sends the agent back once (ADR 008); next the regression evals and the REST API with persisted providers.
Then 4 Phoenix adapters and Codex; 5 dashboard, Cloud Run, write-up.

## Dependency policy

- Upgrade Nx and its plugins only through `pnpm nx migrate latest` followed by `pnpm install` and
  `pnpm nx migrate --run-migrations`, so Nx's own migrations run.
- Other packages: `pnpm outdated -r`, bump, then `pnpm check`. Checked on 2026-10-13.
- TypeScript stays on 6.0.x until `typescript-eslint` (peer `<6.1.0`) and `@swc-node/register` (peer `<7`)
  accept TypeScript 7. Re-check those two peers before trying.
- `@types/node` tracks the runtime major in `engines`, `.nvmrc` and CI (Node 24 LTS), not the newest release.
- `ts-jest` is installed only because `@nx/jest` lists it as a peer; tests compile with `@swc/jest`.
