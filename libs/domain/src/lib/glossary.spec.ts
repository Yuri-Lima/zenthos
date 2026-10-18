import { GATES } from './gate.js';
import { METRICS } from './metrics.js';
import { REVIEW_RUBRIC } from './review.js';
import { RUN_EVENTS, RUN_STATES } from './run-state.js';
import { GLOSSARY, GlossaryTermSchema, glossaryGraph, termById } from './glossary.js';

describe('glossary', () => {
  it('defines every state, event, gate, metric and rubric line, once, and every term passes the schema', () => {
    const ids = GLOSSARY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of RUN_STATES) expect(termById(`state_${s}`)?.kind).toBe('state');
    for (const e of RUN_EVENTS) expect(termById(`event_${e}`)?.kind).toBe('event');
    for (const g of GATES) expect(termById(`gate_${g}`)?.kind).toBe('gate');
    for (const m of Object.keys(METRICS)) expect(termById(`metric_${m}`)?.kind).toBe('metric');
    for (const r of Object.keys(REVIEW_RUBRIC)) expect(termById(`rubric_${r}`)?.kind).toBe('rubric');
    for (const term of GLOSSARY) expect(GlossaryTermSchema.safeParse(term).success).toBe(true);
  });

  it('relates terms only to terms that exist, and the graph has every relation as an edge', () => {
    const dangling = GLOSSARY.flatMap((t) => t.related.filter((r) => !termById(r.to)).map((r) => `${t.id} -> ${r.to}`));
    expect(dangling).toEqual([]);
    const graph = glossaryGraph();
    expect(graph.nodes.length).toBe(GLOSSARY.length);
    expect(graph.edges.length).toBe(GLOSSARY.reduce((n, t) => n + t.related.length, 0));
    expect(graph.edges.some((e) => e.from === 'state_spec_drafted' && e.to === 'state_spec_approved' && e.rel === 'leads_to')).toBe(true);
  });
});
