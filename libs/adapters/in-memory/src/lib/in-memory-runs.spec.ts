import { runsContract } from '@zenthos/ports';
import { InMemoryRuns } from './in-memory-runs.js';

describe('InMemoryRuns', () => {
  for (const [name, check] of Object.entries(runsContract)) it(name, () => check(new InMemoryRuns(), 'owner/repo#1'));
});
