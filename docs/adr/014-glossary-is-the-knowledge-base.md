# ADR 014: The glossary is the knowledge base, and it lives in the domain

Status: accepted, 2026-10-18

## Context

The dashboard shows states, gates, rubric lines, metrics and views by name. A person meeting "gates
passed" or "review threshold" for the first time should get the meaning without leaving the page, and
the project needs a place where every term is defined once, for the UI, the pull-request comments, the
write-up and, later, a knowledge graph that agents can read.

## Decision

- **The glossary is a domain module** (`libs/domain/src/lib/glossary.ts`). A term has an id, a kind
  (concept, state, event, gate, metric, rubric, view, setting), a title, one English definition, typed
  relations to other terms, and the ADR that decided it when one did. The definitions of states, events,
  gates, metrics and rubric lines are keyed by the domain's own constants, so TypeScript refuses a missing
  one: adding a state without defining it does not compile. Metrics and rubric lines reuse the texts that
  already exist in `METRICS` and `REVIEW_RUBRIC`; nothing is written twice.
- **Relations are the graph.** `part_of`, `leads_to`, `guarded_by`, `decided_by`, `measured_by`,
  `shown_in`, `see_also`: a small fixed set, so the same term list renders as a list, as a graph, and later
  exports as a knowledge graph. A relation must point to an existing term; a test enforces it.
- **The API serves it** at `GET /glossary`, documented like every other response, so the dashboard, the
  CLI and any agent read the same terms through the generated client.
- **The dashboard reads it in two places.** Inline help: a `zen-term` wraps a label and shows the
  definition on hover and focus, with a link to the entry. A Glossary page lists terms by kind with search,
  the related terms as links, and the ADR that decided each term.
- **English is canonical in the domain; Portuguese is a translation keyed by term id** in the dashboard's
  i18n files, and a test checks that every term has one. Translations are the one place where glossary
  text lives outside the domain, and they cannot drift silently.
- **The graph grows from here, not from a new store.** The next steps are: a graph export (JSON-LD) from
  the same module; glossary terms attached to LangFuse traces as tags; the glossary handed to the spec
  writer and the reviewer as part of the repository context, so the agents use the project's words; and,
  when a second repository arrives, per-repository terms layered on the core ones through the same shape.

## Consequences

- Every new state, gate or metric costs one sentence in the domain and one in Portuguese. The tests say
  which is missing.
- The glossary is code, reviewed like code; there is no editing it from the UI in this phase. If people
  other than developers need to edit it, it moves behind a port like the other settings (ADR 010), with the
  domain keeping the core terms.

## Amendment, 2026-10-19: no graph database for the glossary (ADR 016)

- The glossary stays a domain module; about 90 terms and 130 relations need no server. The JSON-LD export
  remains the next step and loads into any graph store later.
- Neo4j is parked for Phoenix. Its likely use is a code graph for the spec writer (files, imports, tests, and
  which merged pull requests touched which files), adopted only if graph retrieval beats plain repository context
  on the spec suite. Community Edition, free and single-instance, would be the edition.
