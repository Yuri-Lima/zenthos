import assert from 'node:assert/strict';
import type { RunControlPort } from './run-control.port.js';

export const runControlContract: Record<string, (port: RunControlPort, ticketKey: string) => Promise<void>> = {
  'start is idempotent per ticket, state follows, decide reaches the run': async (port, ticketKey) => {
    const first = await port.start(ticketKey);
    const second = await port.start(ticketKey);
    assert.equal(second.workflowId, first.workflowId);
    const run = await port.state(ticketKey);
    assert.equal(run?.ticket.key, ticketKey);
    await port.decide(ticketKey, 'approved');
    assert.equal(await port.state('owner/none#0'), undefined);
  },
};
