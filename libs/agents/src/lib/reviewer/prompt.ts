import { REVIEW_RUBRIC, type RubricKey } from '@zenthos/domain';
import type { ReviewInput } from '@zenthos/ports';

/** Bump the version when the wording changes; LangFuse groups traces and scores by it. */
export const REVIEWER_VERSION = 'reviewer/v1';

/** Diff text handed to the model; beyond this the tail is cut and the cut is declared. */
export const DIFF_CHAR_BUDGET = 60_000;

export const REVIEWER_SYSTEM_PROMPT = `You review a code change written by a coding agent against an approved specification.
Judge only what is in the diff and the spec. Cite file paths and line numbers from the diff as evidence.
Be strict about scope: changes to files the spec did not name, or to tooling configuration, count against the change.
Score 1 to 5 where 1 fails the rubric line outright and 5 leaves nothing to improve.`;

export function reviewContext({ spec, diff, gates, profile }: ReviewInput): string {
  const criteria = spec.acceptanceCriteria.map((c) => `- ${c.id}: ${c.statement} (test: ${c.testHint})`).join('\n');
  const gateLines = gates.map((g) => `- ${g.gate}: ${g.passed ? 'pass' : 'fail'}${g.detail ? ` (${g.detail.split('\n')[0]})` : ''}`).join('\n') || '- none run';
  const patch = diff.patch.length > DIFF_CHAR_BUDGET ? `${diff.patch.slice(0, DIFF_CHAR_BUDGET)}\n\n[diff cut after ${DIFF_CHAR_BUDGET} characters; ${diff.files.length} files, ${diff.changedLines} changed lines in total]` : diff.patch;
  return [
    `Repository: ${profile.repo}, base branch ${profile.baseBranch}.`,
    '',
    `Spec for ${spec.ticketKey}`,
    `Problem: ${spec.problem}`,
    `In scope: ${spec.inScope.join('; ')}`,
    `Out of scope: ${spec.outOfScope.join('; ') || 'nothing stated'}`,
    'Acceptance criteria:',
    criteria,
    `Areas expected to change: ${spec.touchedAreas.join(', ')}`,
    '',
    'Gate results already recorded:',
    gateLines,
    '',
    `Files in the diff: ${diff.files.join(', ')}`,
    '',
    '--- Diff ---',
    patch,
  ].join('\n');
}

export function rubricPrompt(key: RubricKey, input: ReviewInput): string {
  return `${reviewContext(input)}\n\nScore this one rubric line and give evidence with file paths and lines:\n${key.replace('_', ' ')}: ${REVIEW_RUBRIC[key]}`;
}

export function findingsPrompt(input: ReviewInput): string {
  return `${reviewContext(input)}\n\nList concrete findings a reviewer would raise on this change. Severity: blocker means it must not merge (wrong behaviour, data loss, security, an edit to tooling or files outside the spec); major means it should change before merge; minor is a suggestion. Then summarise the change in two or three sentences.`;
}
