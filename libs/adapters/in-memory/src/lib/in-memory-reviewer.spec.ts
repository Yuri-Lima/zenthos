import { repoProfile, type Spec } from '@zenthos/domain';
import { reviewerContract } from '@zenthos/ports';
import { InMemoryReviewer } from './in-memory-reviewer.js';

const profile = repoProfile({ repo: 'memory', cloneUrl: 'memory', baseBranch: 'main', allowedCommands: [], gateCommands: [] });
const spec: Spec = { ticketKey: 'memory#1', problem: 'Something is missing', inScope: ['it'], outOfScope: [], acceptanceCriteria: [{ id: 'AC-1', statement: 'It works as described', testHint: 'later' }], touchedAreas: ['x'], risks: [] };

describe('InMemoryReviewer', () => {
  for (const [name, check] of Object.entries(reviewerContract)) {
    it(name, () => check({ port: new InMemoryReviewer(), spec, profile }));
  }
});
