# ADR 013: The dashboard reads like an instrument, and derives everything from the domain

Status: accepted, 2026-10-18

## Context

The first dashboard pages worked but looked like a generic admin template. The owner asked for a
professional, "high-tech lab" interface that people are proud to use, that is accessible, and that makes
each step of a run easy to inspect. Research across agent-observability products (per-run timelines and
trace trees with a span inspector, failure-first views, aggregate dashboards kept apart) and CI dashboards
(status never by colour alone, a programmatic marker on the current step, contrast on indicators) set the
bar.

## Decision

- **Tokens first.** One cool neutral ground, one accent, a reserved status palette (good, info, warn,
  critical, neutral) that nothing else may use, monospace for identifiers and numbers with tabular figures,
  a 4/8 spacing grid, hairline surfaces instead of stacked cards, light and dark from the same tokens.
  Angular Material takes its theme from the same palette through `mat.theme`, so components and custom
  elements agree on every colour.
- **Status is icon + label + colour, always.** One `StatusChip` for every run state and gate result; the
  states that ask for action get a solid or outlined fill. The current step carries `aria-current="step"`.
- **Three views of one run, one inspector.** Pipeline (a stepper), Timeline (every transition with the time
  since the previous one and who caused it) and State machine (the transition table drawn as a graph with
  the travelled edges lit). Clicking a step in any view focuses the inspector: spec, gates, review, cost,
  raw JSON. The inspector opens the tab that matches the step.
- **Everything is derived.** The step order is `RUN_STATES`; the graph's nodes and edges are `TRANSITIONS`;
  the stepper's done, current and repeat counts come from the run's history; gate and rubric names come
  from the domain, so the UI and the pull-request comment say the same words. The only hand-written data
  is layout: where each state sits on the graph canvas, and which icon a state gets.
- **Compact and long labels are both translations.** `state.*` is the sentence a person reads in a table
  ("spec drafted, waiting for you"); `stateShort.*` fits a step or a graph node. Two keys, one state.
- **The overview leads with what asks for action.** An attention strip (waiting for a person, in flight,
  total, spend) above a dense table; each tile filters the table.

## Consequences

- Adding a state to the domain adds a step, a node and a chip without touching the dashboard beyond two
  translation keys and an icon.
- Polling every five seconds is the live view; server-sent events replace it later without changing a page.
- Angular Material replaced PrimeNG for licensing reasons (ADR 012); the tokens make the kit replaceable.
