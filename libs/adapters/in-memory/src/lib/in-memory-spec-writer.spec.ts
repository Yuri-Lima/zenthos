import type { Ticket } from '@zenthos/domain';
import { specWriterContract } from '@zenthos/ports';
import { InMemorySpecWriter } from './in-memory-spec-writer.js';

const ticket: Ticket = {
  key: 'memory#2',
  title: 'Export the list as CSV',
  body: '',
  url: 'https://example.test/memory/2',
  labels: [],
};

describe('InMemorySpecWriter', () => {
  for (const [name, check] of Object.entries(specWriterContract)) {
    it(name, () => check({ port: new InMemorySpecWriter(), ticket }));
  }
});
