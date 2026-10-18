import { z } from 'zod';
import { GATES } from './gate.js';
import type { Run } from './run.js';

/** The one definition of each metric. The API, the dashboard and the write-up read it. */
export const METRICS = {
  spec_approval_rate: { description: 'Specs approved divided by specs drafted', unit: 'ratio', source: 'runs' },
  clean_merge_rate: { description: 'PRs merged with no human code change divided by PRs opened', unit: 'ratio', source: 'scm' },
  ticket_to_pr_minutes: { description: 'Minutes from intake to PR opened, median', unit: 'minutes', source: 'runs' },
  cost_per_ticket_usd: { description: "Mean of the models' own cost estimates at list price per run; the invoice comes from the Console", unit: 'usd', source: 'runs' },
  tokens_per_ticket: { description: 'Mean input plus output tokens the models reported per run', unit: 'count', source: 'runs' },
  gate_failures: { description: 'Failed gate results, counted per gate', unit: 'count', source: 'runs' },
  reviewer_agreement: { description: 'Reviewer verdict matches the human verdict on the labelled set', unit: 'ratio', source: 'evals' },
  regression_score: { description: 'Eval score per prompt version and stage', unit: 'score', source: 'evals' },
  human_minutes_per_ticket: { description: 'Minutes humans spent on approvals and reviews for a run', unit: 'minutes', source: 'approvals' },
} as const;

export type Metric = keyof typeof METRICS;

/** A metric as the API serves it: its definition beside its value, `null` when its source is not the runs store. */
export const MetricValueSchema = z.object({
  metric: z.enum(Object.keys(METRICS) as [Metric, ...Metric[]]),
  description: z.string(),
  unit: z.string(),
  source: z.enum(['runs', 'scm', 'evals', 'approvals']),
  value: z.number().nullable(),
  /** Per-key breakdown where one number is not the whole story (gate failures per gate, tokens per kind). */
  breakdown: z.record(z.string(), z.number()).optional(),
  /** How many runs the value was computed from. */
  runs: z.number().int().min(0),
});

export type MetricValue = z.infer<typeof MetricValueSchema>;

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const minutesBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 60_000;

/**
 * Every metric the runs store can answer, from the stored runs alone; the others come back with a null
 * value and their source named, so the dashboard shows the definition and says where the number lives.
 */
export function computeMetrics(runs: Run[]): MetricValue[] {
  const entry = (metric: Metric, value: number | null, count: number, breakdown?: Record<string, number>): MetricValue => ({ metric, ...METRICS[metric], value, runs: count, ...(breakdown ? { breakdown } : {}) });
  const events = runs.flatMap((run) => run.history);
  const drafted = events.filter((e) => e.event === 'spec_drafted').length;
  const approved = events.filter((e) => e.event === 'spec_approved').length;
  const toPr = runs
    .map((run) => {
      const opened = run.history.find((e) => e.event === 'mr_opened');
      return opened ? minutesBetween(run.createdAt, opened.at) : undefined;
    })
    .filter((m): m is number => m !== undefined);
  const withCost = runs.filter((run) => run.estimatedCostUsd > 0);
  const gateFailures = Object.fromEntries(GATES.map((gate) => [gate, 0])) as Record<string, number>;
  for (const gate of runs.flatMap((run) => run.gates ?? [])) if (!gate.passed) gateFailures[gate.gate]++;
  const tokens = runs.map((run) => run.tokens);
  return [
    entry('spec_approval_rate', drafted ? approved / drafted : null, runs.length, { drafted, approved }),
    entry('clean_merge_rate', null, 0),
    entry('ticket_to_pr_minutes', median(toPr), toPr.length),
    entry('cost_per_ticket_usd', mean(withCost.map((run) => run.estimatedCostUsd)), withCost.length, { total: withCost.reduce((sum, run) => sum + run.estimatedCostUsd, 0) }),
    entry('tokens_per_ticket', mean(tokens.map((t) => t.inputTokens + t.outputTokens)), runs.length, {
      input: tokens.reduce((s, t) => s + t.inputTokens, 0),
      output: tokens.reduce((s, t) => s + t.outputTokens, 0),
      cacheRead: tokens.reduce((s, t) => s + t.cacheReadTokens, 0),
      cacheWrite: tokens.reduce((s, t) => s + t.cacheWriteTokens, 0),
    }),
    entry('gate_failures', Object.values(gateFailures).reduce((a, b) => a + b, 0), runs.length, gateFailures),
    entry('reviewer_agreement', null, 0),
    entry('regression_score', null, 0),
    entry('human_minutes_per_ticket', null, 0),
  ];
}
