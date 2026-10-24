import { workspacesContract } from '@zenthos/ports';
import { InMemoryWorkspaces } from './in-memory-workspaces.js';

describe('InMemoryWorkspaces', () => {
  for (const [name, check] of Object.entries(workspacesContract)) it(name, () => check(new InMemoryWorkspaces()));
});
