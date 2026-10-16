import { providerConnectionsContract, repoProfilesContract } from '@zenthos/ports';
import { InMemoryProviderConnections, InMemoryRepoProfiles } from './in-memory-stores.js';

describe('InMemoryProviderConnections', () => {
  for (const [name, check] of Object.entries(providerConnectionsContract)) it(name, () => check(new InMemoryProviderConnections()));
});

describe('InMemoryRepoProfiles', () => {
  for (const [name, check] of Object.entries(repoProfilesContract)) it(name, () => check(new InMemoryRepoProfiles()));
});
