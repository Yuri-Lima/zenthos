# ADR 008: The reviewer scores, humans merge

Status: accepted, 2026-10-15

## Context

Phase 3 adds a reviewer to the pipeline. A review by a model is only useful if it is consistent enough to
compare with human judgement (the evals in `libs/evals` do that comparison) and if its verdict cannot
replace the human's.

## Decision

- The rubric is one constant in the domain (`REVIEW_RUBRIC`): four lines, each scored 1 to 5 with evidence
  that cites files and lines. The same words appear in the prompt, in the pull-request comment and in the
  evals, so a change to the rubric is one edit.
- The reviewer is a LangGraph graph (`libs/agents`, `reviewer/v1`) that scores the four lines in parallel,
  one narrow question per call, then lists findings and a summary in one more call. Narrow questions make a
  model judge more consistent than one call asked for everything.
- The verdict is a gate (`review_threshold`) decided by the run's policy: any blocker finding fails, otherwise
  the mean must reach `reviewThreshold` (3.5 by default). A failed review sends the coding agent back to the
  same workspace once (`maxReviewRounds`), with the findings as feedback; a second failure escalates.
- The review is posted as a pull-request **comment**, never as an approval or a request for changes. A bot
  approving its own pull request would make the human reviewer a formality. Humans merge.
- The reviewer sees the diff as the host serves it (`ScmPort.readPullRequestDiff`), not the sandbox's, so it
  judges exactly what a human will merge.

## Consequences

- Review cost is five model calls per round. The context is identical across them; prompt caching is the
  first optimisation if that cost matters.
- `apps/worker/src/scripts/review.ts` re-reviews an open pull request outside a workflow, for re-reviews after a human
  pushed and for trying a prompt change on a real diff.
- Until runs are persisted (phase 3 API), a manual re-review needs the drafted spec as a file.
