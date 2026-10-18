import assert from 'node:assert/strict';
import type { RunControlPort } from './run-control.port.js';

export const runControlContract: Record<string, (port: RunControlPort, ticketKey: string) => Promise<void>> = {
  'start is idempotent per ticket and records who asked, state follows, decide reaches the run': async (port, ticketKey) => {
    const first = await port.start(ticketKey, 'contract');
    const second = await port.start(ticketKey, 'someone-else');
    assert.equal(second.workflowId, first.workflowId);
    const run = await port.state(ticketKey);
    assert.equal(run?.ticket.key, ticketKey);
    assert.equal(run?.requestedBy, 'contract');
    await port.decide(ticketKey, 'approved', 'contract');
    assert.equal(await port.state('owner/none#0'), undefined);
  },
};
