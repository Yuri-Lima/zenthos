import { runControlContract } from '@zenthos/ports';
import { InMemoryRunControl } from './in-memory-run-control.js';

describe('InMemoryRunControl', () => {
  for (const [name, check] of Object.entries(runControlContract)) it(name, () => check(new InMemoryRunControl(), 'owner/repo#1'));
});
