import { repoProfile, type Spec } from '@zenthos/domain';
import { codingAgentContract } from '@zenthos/ports';
import { InMemoryCodingAgent } from './in-memory-coding-agent.js';
import { InMemoryRepoProfiles } from './in-memory-stores.js';
import { LocalSandbox } from './local-sandbox.js';

const profile = repoProfile({ repo: 'memory', cloneUrl: 'memory', baseBranch: 'main', allowedCommands: ['echo ok'], gateCommands: [] });
const spec: Spec = { ticketKey: 'memory#1', problem: 'Something is missing', inScope: ['it'], outOfScope: [], acceptanceCriteria: [{ id: 'AC-1', statement: 'It works as described', testHint: 'later' }], touchedAreas: ['docs'], risks: [] };

describe('InMemoryCodingAgent', () => {
  for (const [name, check] of Object.entries(codingAgentContract)) {
    it(name, () => check({ port: new InMemoryCodingAgent(), sandbox: new LocalSandbox(new InMemoryRepoProfiles([profile])), profile, spec }));
  }
});
