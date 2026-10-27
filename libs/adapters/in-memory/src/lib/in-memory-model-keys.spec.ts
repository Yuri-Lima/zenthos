import { modelKeysContract, modelProviderContract } from '@zenthos/ports';
import { InMemoryModelKeys, InMemoryModelProvider } from './in-memory-model-keys.js';

describe('InMemoryModelKeys', () => {
  for (const [name, check] of Object.entries(modelKeysContract)) it(name, () => check(new InMemoryModelKeys(), '00000000-0000-4000-8000-0000000000a1'));
});

describe('InMemoryModelProvider', () => {
  for (const [name, check] of Object.entries(modelProviderContract)) it(name, () => check(new InMemoryModelProvider(), { accepted: 'sk-ant-api03-ok', rejected: 'rejected' }));
});
