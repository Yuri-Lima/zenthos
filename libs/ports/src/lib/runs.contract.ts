import assert from 'node:assert/strict';
import { applyEvent, createRun, type Ticket } from '@zenthos/domain';
import type { RunsPort } from './runs.port.js';

const ticket = (key: string): Ticket => ({ key, title: key, body: '', url: `https://example.test/${key}`, labels: [] });

export const runsContract: Record<string, (port: RunsPort, ticketKey: string) => Promise<void>> = {
  'save replaces by run id, latest follows the newest run of a ticket, list filters by state newest first': async (port, ticketKey) => {
    const first = createRun(ticket(ticketKey), { now: new Date('2026-01-01T00:00:00Z') });
    await port.save(first);
    const drafted = applyEvent(first, 'spec_drafted');
    await port.save(drafted);
    assert.deepEqual(await port.latest(ticketKey), drafted);
    const second = createRun(ticket(ticketKey), { now: new Date('2026-01-02T00:00:00Z') });
    await port.save(second);
    assert.equal((await port.latest(ticketKey))?.id, second.id);
    const intake = await port.list({ state: 'intake' });
    assert.ok(intake.some((run) => run.id === second.id) && !intake.some((run) => run.id === first.id));
    const all = await port.list({ limit: 2 });
    assert.equal(all.length, 2);
    assert.ok(all[0].createdAt >= all[1].createdAt);
    assert.equal(await port.latest('owner/none#0'), undefined);
  },
};
