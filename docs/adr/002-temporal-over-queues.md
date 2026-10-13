# ADR 002: Temporal for orchestration instead of a job queue

Date: 2026-10-13. Status: accepted.

## Decision

One Temporal workflow per ticket owns the run from intake to merge. Activities are thin and call application
use cases. The prior Zenth prototype used a BullMQ-style queue (`zenth-queue`); it is not carried over.

## Why

- A run waits on humans for hours or days (spec approval, review). Temporal signals and timers model that
  directly; a queue needs a hand-written state store and a poller.
- Retries, backoff, heartbeats and compensation are part of the workflow definition, not scattered across
  handlers. The run history in Temporal is also the audit trail.
- The role this project targets names Temporal explicitly.

## Development setup

- `docker-compose.yml` runs `temporalio/auto-setup` on the shared Postgres plus the Temporal UI on port 8080. Host ports avoid 3000, 5432 and 6379, which other local projects usually hold.
- The `temporal` CLI (`temporal server start-dev`) works as a lighter alternative on a laptop; the compose file
  is the one a fresh clone uses.
- Temporal Cloud free tier is the target for the deployed demo (phase 5).

## Consequences

- Workflow code must stay deterministic: no direct I/O, clocks or randomness outside activities.
- Long runs use continue-as-new to keep histories bounded.
