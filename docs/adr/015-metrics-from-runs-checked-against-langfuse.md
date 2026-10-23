# ADR 015: Metrics come from the runs store and are checked against LangFuse per agent

Status: accepted, 2026-10-18

## Context

The old plan's phase gate says the dashboard's numbers must match LangFuse. Three facts shaped how:

- A stored run kept only totals. The coding agent runs inside Claude Code through the Agent SDK and never
  reaches LangFuse; only the spec writer and the reviewer, LangGraph graphs with LangChain callbacks, do. A
  run's total can therefore never equal what LangFuse shows for it.
- The local LangFuse is v4 in events-only mode. Its public sessions and traces endpoints answer "not
  available"; the session id sits on each trace's root observation, while cost and tokens sit on the
  generations below it, which carry no session id.
- Evals and the manual re-review traced under the ticket key, the same session as the run, so LangFuse's
  session for run 300 holds the run's calls plus two later reviews and an eval item that the run never paid for.

## Decision

- **Metrics are computed from the runs store** by the API (`computeMetrics`), as before. LangFuse is the
  cross-check and the place to read individual calls, not the source of the numbers.
- **A run keeps its usage per agent** (`usageByAgent`, spec writer, coding agent, reviewer) beside the totals;
  `withUsage(run, usage, agent)` adds to both. Runs stored before have an empty split, filled in by the run
  schema's default: both stores now parse rows on the way out.
- **The check is per traced agent.** `TRACED_ROLES` and their trace version prefixes live in the domain; the
  prompt versions are built from those prefixes, so a version cannot drift from the agent it names.
  `compareWithTraces` returns, per agent, `match`, `mismatch`, `not_recorded` (run stored before the split) or
  `not_traced`. Two estimates priced apart agree within 5% or one cent.
- **A read-only port reads LangFuse** (`TraceUsagePort`, adapter `LangfuseTraceUsage` over `fetch`): the root
  observations of the session give the trace ids, one v2 metrics query sums cost and tokens over those traces
  by version. The API holds a LangFuse key pair for this; without one the check says it is unavailable.
- **Only the workflow traces under the bare ticket key.** `traceSessionId(ticketKey, purpose)` names the
  session: `run` is the key itself, evals trace as `eval:<key>`, manual commands as `manual:<key>`. A run's
  session then holds exactly what the run paid for.
- **The check is asked on demand**, one run at a time, from the metrics page: two LangFuse calls per run, never
  on page load.
- **Metrics whose source is not the runs store say where they live** instead of showing a number: clean merge
  rate needs each merged pull request's commits from GitHub, reviewer agreement and regression score are the
  eval baselines per prompt version, human minutes are recorded nowhere yet.

## Consequences

- The phase gate cannot be proven on the runs stored so far: both predate the per-agent split, and run 300's
  LangFuse session also holds later reviews. The next real run is the first one the check can pass or fail.
- The coding agent's cost is checked against nothing but its own report. Tracing Claude Code into LangFuse
  through the Agent SDK's OpenTelemetry export would close that, and is the next step if its cost is doubted.
- Clean merge rate, reviewer agreement, regression score and human minutes remain open: the first needs an
  SCM read per merged pull request, the eval two need the baselines served by the API, the last needs time
  recorded on approvals.

## Amendment, 2026-10-23: the coding agent is traced too

- Each implementation runs inside an agent span in the ticket's trace (`AgentTracingPort`, LangFuse adapter
  `LangfuseAgentTracing`), carrying the session and the version `coding-agent/v1`. The Agent SDK passes the active
  trace context to Claude Code, so Claude Code's own OpenTelemetry spans (each turn, model request and tool call)
  nest inside it; Claude Code exports them straight to LangFuse's OTLP endpoint.
- Claude Code's spans carry token counts under names LangFuse does not read as usage, and no cost. So when the run
  returns, one generation per model records the tokens the SDK reported, without a cost: LangFuse prices them with
  its own model table, as it does the spec writer's and the reviewer's calls. The cost check covers all three agents.
- The adapter now takes tokens and cost from the SDK's `modelUsage`, which covers every model call; `usage`, used
  before, is documented as the main agent loop only and undercounted subagent and auxiliary calls.

