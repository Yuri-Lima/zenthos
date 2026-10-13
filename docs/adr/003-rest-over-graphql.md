# ADR 003: REST for the API, not GraphQL

Date: 2026-10-13. Status: accepted.

## Decision

`apps/api` (phase 1 onward) exposes a small REST API with NestJS: trigger a run, approve or reject, list runs,
read metrics, and receive webhooks from GitHub and GitLab. OpenAPI is generated from the controllers and the
TypeScript client for the dashboard and CLI is generated from it, never hand-written.

## Why

- The surface is small and has one consumer (the dashboard) plus the CLI. A GraphQL schema would add a layer
  with no second consumer to justify it.
- Inbound webhooks are REST anyway.
- Generated OpenAPI clients keep the single-source-of-truth rule: the controller is the definition.

## Consequences

- Response shapes reuse the zod schemas from `libs/domain` through `nestjs-zod` or equivalent, so the API never
  defines a parallel type.
- If a second consumer with very different read patterns appears, revisit.
