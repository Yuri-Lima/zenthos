import { evalResultsContract } from '@zenthos/ports';
import { InMemoryEvalResults } from './in-memory-eval-results.js';

describe('InMemoryEvalResults', () => {
  const port = new InMemoryEvalResults([{ suite: 'review', dataset: 'o-r-runs', promptVersion: 'reviewer/v1', runName: 'r1', createdAt: '2026-10-21T09:00:00.000Z', scores: { review_agreement: 1 } }]);
  for (const [name, check] of Object.entries(evalResultsContract)) it(name, () => check(port));
});
