import { APPROVAL_LABELS, type Spec } from '@zenthos/domain';

const list = (items: string[]) => items.map((item) => `- ${item}`).join('\n');

/** The comment a human reads on the ticket. The labels named here are the ones the run polls for. */
export function renderSpecComment(spec: Spec): string {
  const criteria = spec.acceptanceCriteria
    .map((c) => `- **${c.id}** ${c.statement}\n  Test: ${c.testHint}`)
    .join('\n');
  return [
    '## Spec draft (ZenthOs)',
    '',
    `**Problem.** ${spec.problem}`,
    '',
    '**In scope**',
    list(spec.inScope),
    '',
    spec.outOfScope.length ? `**Out of scope**\n${list(spec.outOfScope)}\n` : '',
    '**Acceptance criteria**',
    criteria,
    '',
    '**Touched areas**',
    list(spec.touchedAreas),
    '',
    spec.risks.length ? `**Risks**\n${list(spec.risks)}\n` : '',
    `Add the label \`${APPROVAL_LABELS.approved}\` to approve, or \`${APPROVAL_LABELS.rejected}\` to ask for a new draft.`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}
