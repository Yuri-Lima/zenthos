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
10. **Adopt before building** (ADR 016). Before writing a feature, name the closest free built-in in LangChain,
    LangGraph or LangFuse and its price. A free, self-hostable one is adopted; we build only what is paid elsewhere
    or does not exist for a ticket pipeline.
11. **Safety defaults.** No destructive git in any sandbox. Migrations and production paths need a human approval
    signal. Cost ceilings are enforced per run. No stored API keys: model access comes from an OAuth profile on a
    laptop and from workload identity federation in CI and the cloud (`docs/authentication.md`).

## Layout

| Path | Holds | Depends on |
| --- | --- | --- |
| `libs/domain` | Entities, run state machine, zod schemas, gates, policies, metrics, error codes | nothing but zod and node |
| `libs/ports` | One interface per adapter family, each with a `*.contract.ts` test | domain |
| `libs/application` | One file per use case | domain, ports |
| `libs/adapters/*` | One library per concrete adapter: `in-memory` (tests and dry runs), `github` (issues and pull requests), `langfuse` (tracing callbacks, and reading a run's usage back for the check, ADR 015), `git-sandbox` (a clone per run with the command allowlist), `claude-code` (headless Claude Code with the same allowlist) | domain, ports |
| `libs/agents` | LangGraph graphs that implement agent ports. Spec writer: draft, validate against the schema, retry with the errors | domain, ports, LangChain |
| `libs/evals` | Golden dataset schema, metrics, regression check and the port-based suite runner (ADR 009); moving onto LangFuse Datasets and Experiments (ADR 016) | domain, ports |
| `libs/adapters/postgres` | Provider connections (secrets sealed at rest) and repository profiles in Postgres; the schema as ordered statements (ADR 010) | domain, ports |
| `libs/adapters/temporal` | `RunControlPort` over the Temporal client and the workflow bundler config, shared by the API, the CLI and the worker | domain, ports |
| `apps/api` | NestJS REST API: provider connections with a credential check before storing and on demand, the GitHub manifest and install flows, repository profiles, runs from the stored projection, metrics computed from it, the GitHub webhook; OpenAPI at `/docs` and committed as `openapi.json` (ADR 010, ADR 011) | everything |
| `apps/dashboard` | Angular dashboard (Material + Tailwind, en/pt JSON under `public/i18n`): sign-in gate, runs list, run detail with approve and reject, start a run, settings for providers and repository profiles with derived first-run steps (ADR 010), metrics with cost by agent and the LangFuse check (ADR 015), glossary with inline help (ADR 014); only the generated client reaches the API; polls until server-sent events exist (ADR 012) | api-client |
| `libs/api-client` | The typed client the dashboard uses: `schema.ts` generated from `apps/api/openapi.json` with openapi-typescript, `createApiClient` over openapi-fetch; never hand-edited (ADR 003) | nothing |
| `apps/worker` | Temporal worker: `workflows.ts` (one workflow per ticket), `activities.ts` (thin, call use cases), `config.ts` (zod-validated env), `composition.ts` (the adapters, chosen once), `repos.ts` (the dry-run repository profiles), `scripts/` (contract check, manual review, evals) | anything |
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
- A new target repository is a profile: `PUT /repos/:owner/:name` on the API when the store is Postgres, or an
  entry in `apps/worker/src/repos.ts` for dry runs (ADR 010). Allowed commands are exact lines; a gate command
  must be one of them (ADR 005).
- Temporal workflow code stays deterministic; I/O lives in activities that call use cases. Workflow code may
  import `@zenthos/domain` (pure) and nothing with node or vendor imports; `bundlerOptions` in
  `libs/adapters/temporal` resolves the workspace sources for the workflow bundle.
- Agent graphs take a LangChain `Runnable` as the model and are tested with `RunnableLambda` fakes (ADR 004).
  Each graph is built by one function (`buildSpecWriterGraph`, `buildReviewerGraph`) that the port adapter and
  the Studio entries in `libs/agents/src/studio` share; never a second copy of a graph for Studio.
- Prompts carry a version string (`SPEC_WRITER_VERSION`); bump it when the wording changes.
- Dashboard (ADR 013): colours only through the tokens in `styles.scss`; status is always icon + label + colour
  through `StatusChip`; state order, graph edges, gate and rubric names come from `@zenthos/domain`, never a
  list in the UI; `state.*` and `stateShort.*` are the two translations of one state.
- Usage is recorded per agent (ADR 015): every `withUsage` names the agent; only the workflow traces under the bare
  ticket key, evals and manual commands pass their purpose to `specWriter`/`reviewer` so their calls trace beside the
  run's session (`traceSessionId`), never inside it.
- Glossary (ADR 014): every term is defined once in `libs/domain/src/lib/glossary.ts`; definitions of states,
  events, gates, metrics and rubric lines are keyed by the domain constants, so a new one fails to compile until
  it is defined; `GET /glossary` serves it; the dashboard wraps labels in `zen-term` for inline help and lists
  it at `/glossary`; Portuguese lives under `glossary.*` and `glossaryTitle.*` in `pt.json`, one key per term id,
  and a test fails when one is missing.
- No API keys in the repo or in CI. Model access comes from an `ant auth login` profile on a laptop and from
  Workload Identity Federation elsewhere; GitHub access from a GitHub App; `docs/authentication.md` has both.
  Claude Code's claude.ai login is for a developer's own laptop only; shared deployments give the coding agent
  the deployment's credentials (ADR 005).
- Model cost on a run is `estimatedCostUsd`, an estimate at list price, kept beside the reported token counts.
  Never present it as a bill.
- The pipeline acts on GitHub only through installation tokens; a signed-in user's token identifies the person
  and never does the bot's work (ADR 007).
- Provider connections and repository profiles are configuration the product owns (ADR 006, ADR 010): the
  stores behind `ProviderConnectionsPort` and `RepoProfilesPort`, written by the API. The worker resolves
  credentials per repository from the connection a profile names (`credentialsForRepo`), with
  `githubCredentials()` from its environment as the only fallback; add nothing credential-shaped anywhere else.

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
pnpm api               # REST API on :3200, OpenAPI at /docs (RUN_CONTROL=temporal to drive real runs)
pnpm studio            # LangGraph Studio dev server on :2024 for the spec_writer and reviewer graphs (langgraph.json)
pnpm dashboard         # Angular dashboard on :4200 (Angular Material + Tailwind, en/pt), talks to the API through libs/api-client
pnpm nx run @zenthos/api-client:generate   # apps/api/openapi.json from the controllers, then the typed client (ADR 003); CI fails on a diff
pnpm nx run @zenthos/worker:contract -- owner/repo#123   # live GitHub check: comment, commit attribution, cleanup
pnpm nx run @zenthos/worker:review -- owner/repo#123 spec.json   # re-review the open pull request of a run (ADR 008)
pnpm nx run @zenthos/worker:eval-dataset -- owner/repo            # golden dataset from merged pull requests (ADR 009)
pnpm nx run @zenthos/worker:eval -- spec owner/repo --limit 5     # spec suite against libs/evals/baseline.json; --record sets it
pnpm nx run @zenthos/worker:eval -- review owner/repo --limit 3   # review suite (costs both agents per item)
pnpm nx run @zenthos/worker:eval-dataset -- owner/repo --from runs    # the pipeline's own judged runs, specs included (ADR 011)
pnpm nx run @zenthos/worker:eval -- review owner/repo --dataset runs  # the fair review measurement; baselines keyed per dataset
ZENTHOS_SECRETS_KEY_NEXT=... pnpm nx run @zenthos/worker:rotate-key   # re-seal stored connections under a new deployment key
pnpm nx g @nx/js:lib libs/adapters/<name> --importPath=@zenthos/adapter-<name> --tags=scope:adapter --bundler=tsc --linter=eslint --unitTestRunner=jest --minimal
```

Jest configs are `jest.config.cjs` (plain CommonJS) because Jest cannot load `.cts` configs under TypeScript 6.

## Roadmap

Phases 0 to 2 are in: scaffold; intake, spec draft and human decision; implementation by Claude Code in a git
sandbox, deterministic gates with one feedback retry, and a pull request to the base branch. Phase 3 in
progress: the reviewer scores the pull request against the domain rubric and posts a comment, a failed review
sends the agent back once (ADR 008); the evals measure both agents against merged history and block a prompt
change that lowers the scores (ADR 009); the REST API keeps provider connections and repository profiles in
Postgres with secrets sealed, connects GitHub by the manifest flow and takes the app's webhook (ADR 010); the worker
acts with the connection each profile names and records every run transition to the store, which the API serves
(ADR 011). Phases were swapped (ADR 012): phase 4 is the Angular dashboard (PrimeNG, en/pt, Sign in with GitHub
with an allowlist, generated OpenAPI client, metrics from the runs store) plus Legal Connect hardening; phase 5
is Phoenix (YouTrack, GitLab, TeamCity, Codex); phase 6 is Cloud Run and the write-up.
Then 4 Phoenix adapters and Codex; 5 dashboard, Cloud Run, write-up.

## Dependency policy

- Upgrade Nx and its plugins only through `pnpm nx migrate latest` followed by `pnpm install` and
  `pnpm nx migrate --run-migrations`, so Nx's own migrations run.
- Other packages: `pnpm outdated -r`, bump, then `pnpm check`. Checked on 2026-10-13.
- TypeScript stays on 6.0.x until `typescript-eslint` (peer `<6.1.0`) and `@swc-node/register` (peer `<7`)
  accept TypeScript 7. Re-check those two peers before trying.
- `@types/node` tracks the runtime major in `engines`, `.nvmrc` and CI (Node 24 LTS), not the newest release.
- `ts-jest` is installed only because `@nx/jest` lists it as a peer; tests compile with `@swc/jest`.
