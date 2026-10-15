import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { repoProfile } from '@zenthos/domain';
import { sandboxContract } from '@zenthos/ports';
import { InMemorySandbox } from './in-memory-sandbox.js';

const profile = repoProfile({
  repo: 'memory',
  cloneUrl: 'memory',
  baseBranch: 'main',
  allowedCommands: ['echo ok'],
  gateCommands: ['echo ok'],
});

describe('InMemorySandbox', () => {
  for (const [name, check] of Object.entries(sandboxContract)) {
    it(name, () =>
      check({
        port: new InMemorySandbox([profile]),
        profile,
        change: (workspace) => writeFile(path.join(workspace.path, 'a.txt'), 'one\ntwo\n'),
      }),
    );
  }
});
