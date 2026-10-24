import { repoProfile } from '@zenthos/domain';
import { scmContract } from '@zenthos/ports';
import { InMemoryScm } from './in-memory-scm.js';

const profile = repoProfile({ repo: 'memory', cloneUrl: 'memory', baseBranch: 'main', allowedCommands: [], gateCommands: [] });
const checkout = { id: 'w', path: '/w', repo: 'memory', baseBranch: 'main', branch: 'zenthos/memory-1' };

describe('InMemoryScm', () => {
  for (const [name, check] of Object.entries(scmContract)) {
    it(name, () => check({ port: new InMemoryScm(), profile, checkout }));
  }
});
