# ADR 009: Evals are a regression gate, built from merged history

Status: accepted, 2026-10-15

## Context

A prompt change can make an agent quietly worse. The pipeline needs a check that blocks such a change the
way a failing test blocks a code change, without a human re-reading thirty specs each time.

## Decision

- **The golden dataset is history.** Every merged pull request that closes an issue in the target repository
  is one item: the ticket, the pull request, the files it touched, and the verdict `accepted` (a human merged
  it). `libs/evals/data/<repo>.json` holds references only; the runner fetches issue text and diffs through
  the ports at run time, so private code never enters this repository.
- **Two suites, one per agent.** The spec suite drafts a spec per ticket and measures *touched-area recall*
  against the files the human change touched, plus criteria per spec: deterministic proxies that need no
  judge. The review suite has the reviewer score the merged diff against a drafted spec and measures
  *agreement* with the human verdict, plus the mean rubric score.
- **A baseline per prompt version.** `libs/evals/baseline.json` keeps one summary per `spec-writer/vN` and
  `reviewer/vN`. A run compares against the baseline of the version it ran, and fails when a metric drops
  more than the tolerance (0.05, model output is not deterministic). Recording a new baseline is an explicit
  `--record` and a reviewed commit; a prompt rewrite bumps the version and starts a new baseline.
- **Limited runs compare with limited baselines.** Items are taken from the top of the dataset in issue
  order, so `--limit 5` in CI compares with a baseline recorded with the same five.
- **CI runs the spec suite on every pull request** that touches a prompt, a graph or the evals, with model
  access through workload identity federation. The review suite costs both agents per item and runs on
  demand.

## Consequences

- The dataset is as good as the repository's history: Legal Connect has 26 merged pull requests that close
  exactly one issue, close to the 30 the plan hoped for, and no human-rejected changes, so agreement is
  measured only on accepted work. Negative examples come from the pipeline's own escalated runs once the API
  persists them.
- The review suite judges a historical diff against a spec drafted *today*, not the spec the human worked
  from, so a disagreement partly measures spec drift. The first baseline is low (agreement 0 of 3, mean
  score 2.4) and is a floor to improve on, not a verdict on the reviewer; the gate still catches a prompt
  change that lowers it. Reviewing the pipeline's own runs, where the spec is the one implemented, is the
  fair measurement once runs are persisted.
- Touched-area recall rewards specs that name paths; a spec that describes areas in prose scores low on
  purpose.
- Model variance makes a single run noisy; the tolerance absorbs the usual spread, and a borderline failure
  is rerun before the baseline is questioned.
