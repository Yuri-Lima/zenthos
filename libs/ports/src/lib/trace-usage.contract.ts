import assert from 'node:assert/strict';
import { TRACED_ROLES, TracedUsageSchema } from '@zenthos/domain';
import type { TraceUsagePort } from './trace-usage.port.js';

/** Any trace backend: only traced agents come back, each with a valid usage, and the session link names the ticket. */
export const traceUsageContract: Record<string, (port: TraceUsagePort, fixture: { tracedTicket: string; untracedTicket: string }) => Promise<void>> = {
  'returns usage only for traced agents, nothing for an unknown run, and a link per run': async (port, { tracedTicket, untracedTicket }) => {
    const usage = await port.usageForRun(tracedTicket);
    assert.ok(Object.keys(usage).length > 0);
    for (const [agent, value] of Object.entries(usage)) {
      assert.ok((TRACED_ROLES as readonly string[]).includes(agent));
      assert.ok(TracedUsageSchema.safeParse(value).success);
    }
    assert.deepEqual(await port.usageForRun(untracedTicket), {});
    assert.ok(port.sessionUrl(tracedTicket).includes(encodeURIComponent(tracedTicket)));
  },
};
