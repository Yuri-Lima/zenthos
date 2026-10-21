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
- The review suite over history judges a diff against a spec drafted *today*, not the spec the human worked
  from, so a disagreement partly measures spec drift. The first baseline is low (agreement 0 of 3, mean
  score 2.4) and is a floor to improve on, not a verdict on the reviewer; the gate still catches a prompt
  change that lowers it.
- **The fair measurement is the pipeline's own runs** (added 2026-10-16, with ADR 011). `eval-dataset --from
  runs` turns every stored run whose pull request a human has merged or closed into an item that carries
  the spec that run implemented; merged is `accepted`, closed without merge is `rejected`, so this dataset
  has negatives. The review suite uses an item's own spec when it has one. Baselines are keyed
  `<prompt version>@<dataset>`, so the history and the runs datasets never share one. The runs dataset
  grows only as pull requests get judged; until then the builder says what it skipped and writes nothing.
- Touched-area recall rewards specs that name paths; a spec that describes areas in prose scores low on
  purpose.
- Model variance makes a single run noisy; the tolerance absorbs the usual spread, and a borderline failure
  is rerun before the baseline is questioned.

_Superseded in part by ADR 016 (21 Oct 2026): datasets and runs live in LangFuse and CI runs the LangFuse experiment action; the regression gate and the reviewed baseline file stay._
