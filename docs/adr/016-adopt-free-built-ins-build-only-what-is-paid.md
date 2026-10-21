# ADR 016: Adopt free built-ins, build only what is paid elsewhere

Status: accepted, 2026-10-19

## Context

Before going further, every ZenthOs feature was set against LangChain, LangGraph, LangGraph Studio and Agent
Server, LangSmith, LangFuse, Open SWE and Neo4j, with what each costs (review published as "ZenthOs Build or
Adopt", 18 October 2026; vendor pages checked that day). The question was whether we were rebuilding what the
ecosystem already gives away.

## Decision

- **The rule.** If a free, self-hostable built-in does the job, adopt it and delete ours. Build only what is paid
  elsewhere (sandboxes, a durable runtime, decision audit) or what no Lang product does for a ticket pipeline
  (deterministic gates, spec approval on the ticket, repository profiles, pipeline metrics).
- **Evals move onto LangFuse Datasets and Experiments.** Datasets live in LangFuse; suites run through
  `dataset.runExperiment`; touched-area recall and review agreement become item evaluators; the regression rule
  becomes a run-level evaluator that fails CI. `libs/evals/baseline.json` and the custom runner are deleted. The
  metrics page reads reviewer agreement and regression score from LangFuse. This supersedes the runner and the
  baseline file of ADR 009; its intent, a regression gate on every prompt change, stays.
- **Prompts stay in the repository and CI publishes them to LangFuse.** Code review remains the gate on prompt
  text; LangFuse gets each version so traces link to it and the playground and prompt experiments use the real
  prompt. Runs never fetch prompts at run time.
- **The coding agent is traced into LangFuse** through the Claude Agent SDK's OpenTelemetry export, so LangFuse
  sees all three agents and the cost check of ADR 015 can cover the coding agent.
- **Kept, with the reason:** Temporal for the pipeline (free, self-hosted, long activities and timers; LangGraph
  stays inside the agents, one orchestrator per layer); the git sandbox (paid everywhere else); the gates and the
  spec approval; Claude Code as the coding agent (proven on a merged pull request; Deep Agents would replace it
  with no measured gain); run-time cost estimation (the cost ceiling needs it during the run, LangFuse prices
  later); pipeline metrics; the dashboard and settings; the decision audit in run history (LangFuse audit logs are
  Enterprise and cover LangFuse itself).
- **Not built, configured in LangFuse instead:** LLM cost and latency charts (custom dashboards), alerts, human
  labelling (annotation queues), online quality scoring (LLM-as-judge). Agent memory, if it comes, uses the
  LangGraph store on our Postgres.
- **Neo4j is parked for Phoenix** (ADR 014 amended): not for the glossary; a code-graph retrieval experiment only
  when it beats plain repository context on the spec suite.

## Consequences

- Slice order for the rest of phase 4: evals on LangFuse with prompt publishing, then coding-agent tracing, then
  the Legal Connect improvements, now measured as LangFuse experiments.
- The eval regression gate depends on the LangFuse instance CI can reach; CI already needs it for traces.
- Open SWE is the closest product; the write-up names it and states the differences (spec approval before code,
  deterministic gates, a free self-hosted stack, an eval gate, any provider).
- A new feature starts with the same check: name the closest built-in and its price before writing code.

## Amendment, 2026-10-21: what slice 6 found while adopting LangFuse experiments

- **The baseline file stays.** LangFuse's experiment action does not compare runs; its documented CI pattern is a
  reviewed baseline file in the repository that the experiment script checks, raising `RegressionError`. So
  `libs/evals/baseline.json` is the bar, LangFuse runs and stores the experiments. What went: our runner and its
  concurrency code, the local dataset files, the local result files.
- **CI uses `langfuse/experiment-action`** (pinned to v1.0.12): it runs `apps/worker/src/experiments/*-suite.ts`,
  fails the job on `RegressionError`, and comments the scores and the LangFuse comparison link on the pull request.
  The same scripts run locally through `worker:eval`, so CI and a laptop take one path.
- **The action resolves every `@langfuse/*` and `@opentelemetry/*` import from the repository root.** pnpm hoists
  both scopes (`publicHoistPattern`); each exists in one version today, and a second major would need a look.
- **LangFuse v4 in events-only mode has no dataset-run endpoints** (list, delete). Run-level scores carry the
  experiment run as their subject and the metadata the experiment stamps (suite, prompt version, dataset), so the
  metrics page reads the latest results from the v3 scores endpoint alone.
- **CI needs a LangFuse that GitHub's runners can reach.** A laptop instance is not; LangFuse Cloud or an exposed
  self-hosted instance is a decision outside the code.
- **Prompt publishing guards the version rule:** different text under an existing label fails the publish, so a
  prompt cannot change without a new version.
