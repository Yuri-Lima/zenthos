/** The one definition of each metric. The API, the dashboard and the write-up read it. */
export const METRICS = {
  spec_approval_rate: {
    description: 'Specs approved without edits divided by specs posted',
    unit: 'ratio',
  },
  clean_merge_rate: {
    description: 'PRs merged with no human code change divided by PRs opened',
    unit: 'ratio',
  },
  ticket_to_pr_minutes: {
    description: 'Minutes from intake to PR opened',
    unit: 'minutes',
  },
  cost_per_ticket_usd: {
    description: 'Sum of the models\' own cost estimates at list price across a run; the invoice comes from the Console',
    unit: 'usd',
  },
  tokens_per_ticket: {
    description: 'Input, output and cached tokens the models reported across a run',
    unit: 'count',
  },
  gate_failures: {
    description: 'Failed gate results, counted per gate',
    unit: 'count',
  },
  reviewer_agreement: {
    description: 'Reviewer verdict matches the human verdict on the labelled set',
    unit: 'ratio',
  },
  regression_score: {
    description: 'Eval score per prompt version and stage',
    unit: 'score',
  },
  human_minutes_per_ticket: {
    description: 'Minutes humans spent on approvals and reviews for a run',
    unit: 'minutes',
  },
} as const;

export type MetricName = keyof typeof METRICS;
