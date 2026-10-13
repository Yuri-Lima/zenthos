import assert from 'node:assert/strict';
import { parseSpec, type Ticket } from '@zenthos/domain';
import type { SpecWriterPort } from './spec-writer.port.js';

export type SpecWriterFixture = { port: SpecWriterPort; ticket: Ticket };

export const specWriterContract: Record<string, (fixture: SpecWriterFixture) => Promise<void>> = {
  'draftSpec returns a spec that passes the schema and names the ticket': async ({ port, ticket }) => {
    const spec = await port.draftSpec({ ticket, repoContext: '' });
    assert.deepEqual(parseSpec(spec), spec);
    assert.equal(spec.ticketKey, ticket.key);
  },
};
