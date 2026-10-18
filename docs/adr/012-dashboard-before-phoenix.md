# ADR 012: The dashboard comes before Phoenix

Status: accepted, 2026-10-18

## Context

The plan put the Phoenix adapters (YouTrack, GitLab, TeamCity, Codex) in phase 4 and the dashboard,
deployment and write-up in phase 5. After phase 3 the pipeline is complete end to end on Legal Connect,
every run is stored, and the API serves it. The owner wants to see and operate what exists, and to
improve the Legal Connect workflow with numbers in front of them, before swapping providers.

## Decision

- **Phase 4 is the dashboard and Legal Connect hardening; phase 5 is Phoenix; phase 6 is Cloud Run and
  the write-up.** Nothing in Phoenix reshapes the core: the ports already cover a second tracker, SCM and
  CI, and the provider list is one domain constant.
- **Angular with PrimeNG and Tailwind**, standalone bootstrap, English and Portuguese from JSON. The same
  stack as Phoenix's UI, so the kit is known and the write-up compares like with like.
- **Sign in with GitHub through the connected App (ADR 007); authorization is an allowlist of GitHub
  logins in configuration.** Explicit and auditable; a collaborator check against the connected
  repositories can replace it later without touching the pages.
- **The dashboard talks only to the API, through a TypeScript client generated from OpenAPI (ADR 003)**,
  and metrics are computed by the API from the runs store. LangFuse stays the trace viewer the dashboard
  links to; it is not a data source for the pages.
- **Deployment stays last.** The dashboard is built against local services; Cloud Run, Pub/Sub webhooks
  and workload identity on Google come with phase 6.
- **Legal Connect improvements go in this order:** path-shaped touched areas in the spec writer, measured
  by the spec suite; a tunnel so a label starts a run through the webhook; then, once the dashboard shows
  runs, Playwright as a gate and one more real issue to exercise the retry rounds.
- **The plan's unbuilt extras are deferred, not pending:** a LangSmith tracing adapter, a model router, a
  test-planner graph and WhatsApp approvals. The roadmap describes what the code does.

## Consequences

- Sign-in is the API's first security surface; it lands before any page is reachable beyond localhost,
  with CORS limited to the dashboard origin.
- The generated client becomes a CI check: a controller change that is not regenerated fails the build.
- Phoenix waits; its ADR-shaped questions (YouTrack has no OAuth, TeamCity builds as the gate) are
  unchanged by the wait.
