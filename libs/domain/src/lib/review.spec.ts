import { DEFAULT_POLICY } from './policies.js';
import { checkReviewThreshold, parseReview, reviewScore, type Review } from './review.js';

const good: Review = {
  scores: {
    correctness: { score: 5, evidence: 'Implements AC-1 and AC-2 exactly' },
    spec_coverage: { score: 4, evidence: 'AC-2 test checks the happy path only' },
    readability: { score: 4, evidence: 'Clear names; one comment explains the modal choice' },
    engineering_rules: { score: 5, evidence: 'No tooling edits, one shared constant' },
  },
  findings: [{ file: 'e2e/tests/x.spec.ts', line: 12, severity: 'minor', message: 'Assert the row count as well' }],
  summary: 'Small, focused change that matches the spec.',
};

describe('review', () => {
  it('scores the mean of the four rubric lines', () => {
    expect(reviewScore(good)).toBe(4.5);
  });

  it('passes the threshold without blockers and fails below it', () => {
    expect(checkReviewThreshold(good, DEFAULT_POLICY).passed).toBe(true);
    const weak: Review = { ...good, scores: { ...good.scores, correctness: { score: 1, evidence: 'Does not implement AC-1' }, spec_coverage: { score: 2, evidence: 'No tests' } } };
    expect(checkReviewThreshold(weak, DEFAULT_POLICY)).toMatchObject({ gate: 'review_threshold', passed: false });
  });

  it('fails on a single blocker whatever the scores', () => {
    const blocked: Review = { ...good, findings: [{ file: 'src/a.ts', severity: 'blocker', message: 'Deletes user data on every save' }] };
    expect(checkReviewThreshold(blocked, DEFAULT_POLICY).detail).toContain('1 blocker');
  });

  it('rejects a review that does not match the schema', () => {
    expect(() => parseReview({ ...good, summary: 'short' })).toThrow(/Review/);
  });
});
