# ADR 001: Hexagonal core with one port per adapter family

Date: 2026-10-13. Status: accepted.

## Decision

The core of ZenthOs (`libs/domain`, `libs/ports`, `libs/application`) imports no vendor SDK and no framework.
Everything vendor-specific (GitHub, GitLab, YouTrack, Temporal, LangChain, LangFuse, Claude Code, Codex) lives in
an adapter under `libs/adapters/*` behind an interface in `libs/ports`. The ESLint rule
`@nx/enforce-module-boundaries` enforces it with scope tags and a banned-vendor list in `eslint.config.mjs`.

## Why

- The same pipeline must run on Legal Connect (GitHub, GitHub Actions, Playwright) and Phoenix (YouTrack, GitLab,
  TeamCity, Jest, Cypress). Only the adapter set may change between them.
- Domain logic (run state machine, gates, policies, metrics) must be testable in milliseconds with no network.
- Agent and model choices will change often. They must not leak into the state machine.

## Rules that keep it small

- A port exists only when a second adapter is real or planned in the roadmap. No speculative interfaces.
- Every port ships a contract test (`*.contract.ts`) that every adapter spec runs against its own fixture.
- Adapters translate. They hold no business decisions and no retries. Retries belong to Temporal.
- Dependency direction: domain depends on nothing. ports depend on domain. application depends on domain and
  ports. adapters, agents and evals depend on domain and ports. apps depend on anything.

## Consequences

- A new tracker or coding agent is one new library plus a contract test run.
- Some duplication of DTO shapes between an adapter and its SDK is accepted; it stays inside the adapter.
