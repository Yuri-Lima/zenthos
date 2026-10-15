import { checkReviewThreshold, DomainError, REVIEW_RUBRIC, RUBRIC_KEYS, reviewScore, type GateResult, type RepoProfile, type Review, type Run } from '@zenthos/domain';
import type { ReviewerPort, ScmPort } from '@zenthos/ports';

export type ReviewChangeDeps = { reviewer: ReviewerPort; scm: ScmPort };

export type ReviewResult = { review: Review; gate: GateResult };

/**
 * Use case 7: the reviewer scores the pull request's diff against the rubric, the policy decides
 * whether that passes, and both are posted where the human reviewer already looks. The verdict is
 * a gate, never a merge: humans merge.
 */
export async function reviewChange({ reviewer, scm }: ReviewChangeDeps, run: Run, profile: RepoProfile): Promise<ReviewResult> {
  if (!run.spec || !run.pullRequest) throw new DomainError('invalid_review', { reason: 'run has no spec or no pull request to review' });
  const diff = await scm.readPullRequestDiff(profile, run.pullRequest);
  const review = await reviewer.review({ spec: run.spec, diff, gates: run.gates ?? [], profile });
  const gate = checkReviewThreshold(review, run.policy);
  await scm.postReview({ profile, pullRequest: run.pullRequest, body: renderReviewComment(review, gate) });
  return { review, gate };
}

/** Evidence runs to paragraphs, so each rubric line is a collapsible section rather than a table cell. */
export function renderReviewComment(review: Review, gate: GateResult): string {
  const label = (key: keyof typeof REVIEW_RUBRIC) => key.replace('_', ' ');
  const scores = RUBRIC_KEYS.map((key) => `- ${label(key)}: **${review.scores[key].score}/5**`).join('\n');
  const evidence = RUBRIC_KEYS.map(
    (key) => `<details><summary><b>${label(key)}</b> ${review.scores[key].score}/5: ${REVIEW_RUBRIC[key]}</summary>\n\n${review.scores[key].evidence}\n\n</details>`,
  ).join('\n');
  const findings = review.findings.length
    ? review.findings.map((f) => `- **${f.severity}** \`${f.file}${f.line ? `:${f.line}` : ''}\`: ${f.message}`).join('\n')
    : '- none';
  return [
    `## Review by ZenthOs: ${gate.passed ? 'passes the gate' : 'does not pass the gate'}`,
    '',
    review.summary,
    '',
    scores,
    '',
    `Mean ${reviewScore(review).toFixed(2)} of 5${gate.detail ? `. ${gate.detail}` : ''}.`,
    '',
    '**Findings**',
    findings,
    '',
    '**Evidence**',
    evidence,
  ].join('\n');
}

/** What the agent is told when it has to address a failed review. */
export const reviewFeedback = (review: Review): string =>
  [review.summary, ...review.findings.map((f) => `${f.severity} ${f.file}${f.line ? `:${f.line}` : ''}: ${f.message}`)].join('\n');
