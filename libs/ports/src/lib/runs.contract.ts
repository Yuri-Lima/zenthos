import assert from 'node:assert/strict';
import { applyEvent, createRun, type Run, type Ticket } from '@zenthos/domain';
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

  'a workspace lists only its own runs': async (port, ticketKey) => {
    const mine = createRun(ticket(ticketKey), { now: new Date('2026-01-04T00:00:00Z'), workspaceId: '00000000-0000-4000-8000-0000000000a1' });
    const theirs = createRun(ticket(`${ticketKey}1`), { now: new Date('2026-01-04T00:00:01Z'), workspaceId: '00000000-0000-4000-8000-0000000000b2' });
    await port.save(mine);
    await port.save(theirs);
    const listed = await port.list({ workspaceId: mine.workspaceId });
    assert.ok(listed.some((run) => run.id === mine.id));
    assert.ok(!listed.some((run) => run.id === theirs.id));
  },

  'a run stored before a field existed comes back parsed, with that field at its default': async (port, ticketKey) => {
    const older: Partial<Run> = createRun(ticket(ticketKey), { now: new Date('2026-01-03T00:00:00Z') });
    delete older.usageByAgent;
    await port.save(older as Run);
    assert.deepEqual((await port.latest(ticketKey))?.usageByAgent, {});
    assert.deepEqual((await port.list({ limit: 1 }))[0].usageByAgent, {});
  },
};
