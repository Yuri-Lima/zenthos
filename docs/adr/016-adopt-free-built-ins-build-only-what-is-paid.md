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
