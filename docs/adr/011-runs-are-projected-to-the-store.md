# ADR 011: Runs are projected to the store on every transition

Status: accepted, 2026-10-16

## Context

A run's state lived only inside its Temporal workflow, readable through a query while the workflow
existed. The dashboard needs to list runs, a finished run must stay readable after Temporal's retention,
and the review evals need the spec a run actually implemented, not one drafted later.

## Decision

- **The workflow is the truth in flight; the store is the projection.** After intake and after every
  state change, the workflow calls one activity, `recordRun`, which saves the whole run through
  `RunsPort`. The transition and its record are the same step in the workflow, so the projection
  never skips a state; a retried activity rewrites the same row.
- **One row per run id, the run as jsonb**, with the ticket key, the state and the creation time as
  columns for filtering and sorting. A ticket can have several runs; `latest` returns the newest.
- **The API serves the store**: `GET /runs` lists newest first with optional state and limit,
  `GET /runs?ticket=` returns the newest run for a ticket. The CLI keeps querying the workflow, which is
  the live view while a run is in flight.

## Consequences

- The store can lag the workflow by one activity; a reader that needs the exact present asks the workflow.
- Stored runs are the material for a fairer review eval: the diff and the spec of the same run, judged
  against what the human did with its pull request.
- Retention is the database's; nothing is deleted by the pipeline.
