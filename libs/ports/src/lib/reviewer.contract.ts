import assert from 'node:assert/strict';
import { parseReview, type RepoProfile, type Spec } from '@zenthos/domain';
import type { ReviewerPort } from './reviewer.port.js';

export type ReviewerFixture = { port: ReviewerPort; spec: Spec; profile: RepoProfile };

export const reviewerContract: Record<string, (fixture: ReviewerFixture) => Promise<void>> = {
  'review returns a review that passes the schema': async ({ port, spec, profile }) => {
    const { review, estimatedCostUsd } = await port.review({ spec, profile, gates: [], diff: { files: ['src/a.ts'], changedLines: 3, patch: '+a\n+b\n+c' } });
    assert.deepEqual(parseReview(review), review);
    assert.ok(estimatedCostUsd >= 0);
  },
};
