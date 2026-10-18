import { z } from 'zod';
import { GATE_RETRYABLE, GATES, type Gate } from './gate.js';
import { METRICS, type Metric } from './metrics.js';
import { REVIEW_RUBRIC, type RubricKey } from './review.js';
import { RUN_EVENTS, RUN_STATES, TRANSITIONS, type RunEvent, type RunState } from './run-state.js';

/**
 * The knowledge base (ADR 014): every term the product uses, defined once, with typed relations that
 * make the list a graph. Definitions keyed by the domain's constants cannot go missing; metrics and
 * rubric lines reuse their existing texts.
 */
export const TERM_KINDS = ['concept', 'state', 'event', 'gate', 'metric', 'rubric', 'view', 'setting'] as const;
export const RELATIONS = ['part_of', 'leads_to', 'guarded_by', 'decided_by', 'measured_by', 'shown_in', 'see_also'] as const;

export const GlossaryTermSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(TERM_KINDS),
  title: z.string().min(1),
  definition: z.string().min(20),
  related: z.array(z.object({ to: z.string().min(1), rel: z.enum(RELATIONS) })),
  /** The ADR that decided the term, when one did. */
  adr: z.number().int().positive().optional(),
});
export type GlossaryTerm = z.infer<typeof GlossaryTermSchema>;
export type Relation = (typeof RELATIONS)[number];

const STATE_DEFINITIONS: Record<RunState, string> = {
  intake: 'The run exists and the ticket has been read; nothing has been drafted yet.',
  spec_drafted: 'A specification was drafted and posted on the ticket; the run waits for a person to approve or reject it.',
  spec_approved: 'A person approved the specification; the run may implement. Retries after failed gates or a failed review return here.',
  implemented: 'The coding agent produced a change in the sandbox; the gates have not judged it yet.',
  gates_passed: 'Every gate passed, or was skipped because it already fails on the base branch; the change may be pushed.',
  mr_opened: 'The change is pushed and a pull request is open against the base branch; the reviewer judges it next.',
  reviewed: 'The reviewer scored the pull request at or above the threshold with no blocker; humans merge from here.',
  verified: 'A human or a verification step confirmed the change on the target; reserved for the merge gate.',
  done: 'The pull request was merged. Terminal.',
  failed: 'The run stopped and will not continue. Terminal.',
  needs_human: 'The run left the path: drafts or rounds exhausted, a non-retryable gate, or an approval timeout. A person resumes or abandons it.',
};

const EVENT_DEFINITIONS: Record<RunEvent, string> = {
  spec_drafted: 'The spec writer produced a draft that passed the schema.',
  spec_approved: 'A person approved the draft, by label, dashboard or CLI.',
  spec_rejected: 'A person rejected the draft; one more draft is attempted if the policy allows.',
  implemented: 'The coding agent finished a round in the sandbox.',
  gates_passed: 'All gates passed or were baselined as pre-existing failures.',
  gates_failed: 'At least one gate failed; a retryable failure sends the agent back with the failure as feedback.',
  review_passed: 'The reviewer scored the pull request above the threshold with no blocker.',
  review_failed: 'The review fell below the threshold or found a blocker; one more round if the policy allows.',
  mr_opened: 'The pull request was opened or reused on the run branch.',
  verified: 'The change was confirmed on the target.',
  verification_failed: 'The change could not be confirmed on the target.',
  merged: 'The pull request was merged by a person.',
  escalated: 'The run left the path and waits for a person.',
  human_resumed: 'A person sent an escalated run back to implementation.',
  human_abandoned: 'A person closed an escalated run.',
  failed: 'The run failed for a reason no retry addresses.',
};

const GATE_DEFINITIONS: Record<Gate, string> = {
  spec_schema: 'The specification must match the Spec schema: criteria with ids, test hints, scope lists.',
  approval: 'A person must approve the specification before any code is written.',
  sandbox_allowlist: 'Only the exact commands the repository profile allows may run in the sandbox.',
  secret_scan: 'The diff must contain no credential-shaped strings.',
  forbidden_paths: 'The diff must not touch tooling or forbidden path prefixes; editing the gates to pass them is gaming them.',
  diff_budget: 'The diff must stay under the policy line budget.',
  cost_ceiling: 'The run must stay under the policy cost ceiling; a breach is not retried.',
  ci: 'The repository profile gate commands must exit 0, judged against what already fails on the base branch.',
  review_threshold: 'The mean rubric score must reach the policy threshold and no finding may be a blocker.',
};

const CONCEPTS: GlossaryTerm[] = [
  { id: 'run', kind: 'concept', title: 'Run', definition: 'One ticket through the pipeline, from intake to a merged pull request or a stop. One Temporal workflow per ticket; its state changes only through the state machine and every change is stored.', related: [{ to: 'ticket', rel: 'part_of' }, { to: 'state_machine', rel: 'guarded_by' }, { to: 'policy', rel: 'guarded_by' }], adr: 2 },
  { id: 'ticket', kind: 'concept', title: 'Ticket', definition: 'The issue a run works on, as the core sees it whatever tracker it came from: a key such as owner/repo#123, a title, a body, labels.', related: [{ to: 'run', rel: 'see_also' }] },
  { id: 'spec', kind: 'concept', title: 'Specification', definition: 'What the change must do, written by the spec writer and approved by a person: the problem, what is in and out of scope, acceptance criteria that each map to a test, touched areas, risks.', related: [{ to: 'state_spec_drafted', rel: 'leads_to' }, { to: 'gate_spec_schema', rel: 'guarded_by' }, { to: 'view_inspector', rel: 'shown_in' }] },
  { id: 'approval', kind: 'concept', title: 'Approval', definition: 'The human decision on a draft: the label zenthos:spec-approved or zenthos:spec-rejected on the ticket, or approve and reject in the dashboard or CLI. Recorded with who decided.', related: [{ to: 'state_spec_drafted', rel: 'decided_by' }, { to: 'actor', rel: 'see_also' }], adr: 7 },
  { id: 'gate', kind: 'concept', title: 'Gate', definition: 'A deterministic check a change must pass before a pull request opens: policy gates in code, then the repository gate commands, baselined against the base branch. Some failures are retryable, a cost ceiling is not.', related: [{ to: 'state_gates_passed', rel: 'leads_to' }, { to: 'policy', rel: 'guarded_by' }], adr: 5 },
  { id: 'baseline', kind: 'concept', title: 'Baseline', definition: 'What already fails on the pristine base branch. A gate command that fails there is skipped for the change with a note, so the run is judged on what it changed, not on the repository\'s debt.', related: [{ to: 'gate', rel: 'part_of' }, { to: 'gate_ci', rel: 'see_also' }], adr: 5 },
  { id: 'review', kind: 'concept', title: 'Review', definition: 'The reviewer agent scores the pull request\'s diff against the spec on four rubric lines, lists findings with a severity, and posts the result as a comment, never an approval. Humans merge.', related: [{ to: 'rubric', rel: 'measured_by' }, { to: 'gate_review_threshold', rel: 'guarded_by' }, { to: 'state_reviewed', rel: 'leads_to' }], adr: 8 },
  { id: 'rubric', kind: 'concept', title: 'Rubric', definition: 'The four lines a review scores from 1 to 5 with evidence: correctness, spec coverage, readability, engineering rules. One constant; the prompt, the pull-request comment and the evals use the same words.', related: [{ to: 'review', rel: 'part_of' }], adr: 8 },
  { id: 'policy', kind: 'concept', title: 'Policy', definition: 'The limits a run is held to, snapshotted at intake from the repository profile: cost ceiling, diff budget, forbidden paths, implementation and review rounds, review threshold.', related: [{ to: 'repo_profile', rel: 'part_of' }, { to: 'gate', rel: 'see_also' }] },
  { id: 'state_machine', kind: 'concept', title: 'State machine', definition: 'The one definition of how a run moves: states, events and the transitions between them. The worker, the API and the dashboard all read it; the dashboard draws it.', related: [{ to: 'view_graph', rel: 'shown_in' }], adr: 1 },
  { id: 'actor', kind: 'concept', title: 'Actor', definition: 'The person behind a human action: the dashboard login, the GitHub login that set a label, or "cli". Stamped on the run and on the history entry it caused.', related: [{ to: 'approval', rel: 'see_also' }, { to: 'setting_allowlist', rel: 'see_also' }], adr: 12 },
  { id: 'projection', kind: 'concept', title: 'Stored run', definition: 'The copy of a run the worker writes to Postgres after every transition. The workflow is the truth in flight; the store is what the dashboard, the API and the evals read.', related: [{ to: 'run', rel: 'part_of' }], adr: 11 },
  { id: 'cost_estimate', kind: 'concept', title: 'Cost estimate', definition: 'The sum of every agent call\'s estimate at list price, from the tokens the models reported: spec writer, coding agent, reviewer. A budget signal, never an invoice; the Console bills.', related: [{ to: 'metric_cost_per_ticket_usd', rel: 'measured_by' }, { to: 'gate_cost_ceiling', rel: 'guarded_by' }] },
  { id: 'off_ramp', kind: 'concept', title: 'Off-ramp', definition: 'The two states outside the canonical path: needs a human, where a person resumes or abandons the run, and failed, which is terminal. Drawn as exits below the path.', related: [{ to: 'state_needs_human', rel: 'see_also' }, { to: 'state_failed', rel: 'see_also' }] },
  { id: 'repo_profile', kind: 'concept', title: 'Repository profile', definition: 'Everything the pipeline needs to know about one repository: clone URL, base branch, the exact commands allowed in the sandbox, which of them are gates, the policy, and the provider connection that acts on it.', related: [{ to: 'policy', rel: 'see_also' }, { to: 'setting_connection', rel: 'see_also' }], adr: 10 },
  { id: 'evals', kind: 'concept', title: 'Evals', definition: 'Regression suites for the agents: the spec suite against merged history, the review suite against judged pull requests, baselines per prompt version and dataset, a CI job that fails on a drop.', related: [{ to: 'metric_reviewer_agreement', rel: 'measured_by' }, { to: 'metric_regression_score', rel: 'measured_by' }], adr: 9 },
];

const VIEWS: GlossaryTerm[] = [
  { id: 'view_attention_strip', kind: 'view', title: 'Attention strip', definition: 'The tiles above the runs table: specs waiting for a person, runs that need a human, runs in flight, total spend. Each tile filters the table.', related: [{ to: 'state_spec_drafted', rel: 'see_also' }, { to: 'state_needs_human', rel: 'see_also' }], adr: 13 },
  { id: 'view_status_chip', kind: 'view', title: 'Status chip', definition: 'How every state and gate result appears: an icon, a label and a reserved colour, never colour alone. A solid fill marks what asks for action.', related: [{ to: 'state_machine', rel: 'see_also' }], adr: 13 },
  { id: 'view_pipeline', kind: 'view', title: 'Pipeline view', definition: 'The canonical path as a stepper: done steps filled, the current step marked, a repeat count where a retry sent the run back, the off-ramp as an exit. Click a step to inspect it.', related: [{ to: 'state_machine', rel: 'part_of' }, { to: 'view_inspector', rel: 'leads_to' }], adr: 13 },
  { id: 'view_timeline', kind: 'view', title: 'Timeline view', definition: 'Every transition in order with its time, the duration since the previous one and who caused it. A failed gate or review stands out in the sequence.', related: [{ to: 'actor', rel: 'see_also' }, { to: 'view_inspector', rel: 'leads_to' }], adr: 13 },
  { id: 'view_graph', kind: 'view', title: 'State machine view', definition: 'The transition table drawn as a graph, the same picture for every run, with the edges this run took lit.', related: [{ to: 'state_machine', rel: 'part_of' }, { to: 'view_inspector', rel: 'leads_to' }], adr: 13 },
  { id: 'view_inspector', kind: 'view', title: 'Inspector', definition: 'The payload of the selected step: the spec, the gates with their detail, the rubric scores with evidence and findings, cost and tokens by kind, the raw run.', related: [{ to: 'spec', rel: 'see_also' }, { to: 'gate', rel: 'see_also' }, { to: 'review', rel: 'see_also' }], adr: 13 },
];

const SETTINGS: GlossaryTerm[] = [
  { id: 'setting_connection', kind: 'setting', title: 'Provider connection', definition: 'The credentials the pipeline acts with on a provider: a GitHub App (default) or a token. Credentials and app secrets are sealed at rest; the API only ever shows the public half.', related: [{ to: 'repo_profile', rel: 'see_also' }], adr: 10 },
  { id: 'setting_allowlist', kind: 'setting', title: 'Allowlist', definition: 'The GitHub logins allowed into the dashboard after Sign in with GitHub. Empty admits nobody.', related: [{ to: 'actor', rel: 'see_also' }], adr: 12 },
  { id: 'setting_manifest', kind: 'setting', title: 'Manifest flow', definition: 'How GitHub is connected: the API sends the browser to GitHub with an app manifest, GitHub returns a code, the API exchanges it for the app\'s credentials and stores a connection.', related: [{ to: 'setting_connection', rel: 'leads_to' }], adr: 7 },
];

const stateTerm = (state: RunState): GlossaryTerm => ({
  id: `state_${state}`,
  kind: 'state',
  title: state.replace('_', ' '),
  definition: STATE_DEFINITIONS[state],
  related: (Object.values(TRANSITIONS[state]) as RunState[]).map((to) => ({ to: `state_${to}`, rel: 'leads_to' as const })),
  adr: 1,
});
const eventTerm = (event: RunEvent): GlossaryTerm => ({ id: `event_${event}`, kind: 'event', title: event.replace(/_/g, ' '), definition: EVENT_DEFINITIONS[event], related: [{ to: 'state_machine', rel: 'part_of' }] });
const gateTerm = (gate: Gate): GlossaryTerm => ({
  id: `gate_${gate}`,
  kind: 'gate',
  title: gate.replace(/_/g, ' '),
  definition: `${GATE_DEFINITIONS[gate]} ${GATE_RETRYABLE[gate] ? 'A failure can be retried with the failure as feedback.' : 'A failure is not retried; the run escalates.'}`,
  related: [{ to: 'gate', rel: 'part_of' }],
  adr: 5,
});
const metricTerm = (metric: Metric): GlossaryTerm => ({ id: `metric_${metric}`, kind: 'metric', title: metric.replace(/_/g, ' '), definition: `${METRICS[metric].description}. Unit: ${METRICS[metric].unit}; source: ${METRICS[metric].source}.`, related: [{ to: 'evals', rel: 'see_also' }] });
const rubricTerm = (key: RubricKey): GlossaryTerm => ({ id: `rubric_${key}`, kind: 'rubric', title: key.replace('_', ' '), definition: `${REVIEW_RUBRIC[key]}. Scored 1 to 5 with evidence that cites files and lines.`, related: [{ to: 'rubric', rel: 'part_of' }], adr: 8 });

export const GLOSSARY: readonly GlossaryTerm[] = [
  ...CONCEPTS,
  ...RUN_STATES.map(stateTerm),
  ...RUN_EVENTS.map(eventTerm),
  ...GATES.map(gateTerm),
  ...(Object.keys(METRICS) as Metric[]).map(metricTerm),
  ...(Object.keys(REVIEW_RUBRIC) as RubricKey[]).map(rubricTerm),
  ...VIEWS,
  ...SETTINGS,
];

const BY_ID = new Map(GLOSSARY.map((term) => [term.id, term]));
export const termById = (id: string): GlossaryTerm | undefined => BY_ID.get(id);

/** The glossary as a graph: the same terms as nodes, the relations as edges, for the page and for export. */
export const glossaryGraph = () => ({
  nodes: GLOSSARY.map(({ id, kind, title }) => ({ id, kind, title })),
  edges: GLOSSARY.flatMap((term) => term.related.map((r) => ({ from: term.id, to: r.to, rel: r.rel }))),
});
