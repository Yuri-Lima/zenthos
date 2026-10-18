import { applyEvent, createRun, type Ticket } from '@zenthos/domain';
import { age, MACHINE_EDGES, PATH_STATES, stepsFor, travelledEdges } from './run-state';

const ticket: Ticket = { key: 'owner/repo#1', title: 't', body: '', url: 'https://example.test', labels: [] };

describe('stepsFor', () => {
  it('derives done, current and pending from the history, and counts a loop as repeated visits', () => {
    let run = createRun(ticket, { now: new Date('2026-10-18T10:00:00Z') });
    for (const event of ['spec_drafted', 'spec_rejected', 'spec_drafted', 'spec_approved', 'implemented'] as const) run = applyEvent(run, event, new Date(), event === 'spec_approved' ? 'yuri' : undefined);
    const steps = stepsFor(run);
    expect(steps.map((s) => s.state)).toEqual(PATH_STATES);
    expect(steps.find((s) => s.state === 'spec_drafted')).toMatchObject({ status: 'done', visits: 2 });
    expect(steps.find((s) => s.state === 'spec_approved')).toMatchObject({ status: 'done', by: 'yuri' });
    expect(steps.find((s) => s.state === 'implemented')?.status).toBe('current');
    expect(steps.find((s) => s.state === 'gates_passed')?.status).toBe('pending');
    expect(travelledEdges(run).has('spec_drafted->intake')).toBe(true);
  });

  it('lists every transition of the machine and reads ages plainly', () => {
    expect(MACHINE_EDGES.some((e) => e.from === 'mr_opened' && e.to === 'reviewed' && e.event === 'review_passed')).toBe(true);
    const now = Date.parse('2026-10-18T12:00:00Z');
    expect(age('2026-10-18T11:55:00Z', now)).toBe('5 min');
    expect(age('2026-10-18T09:00:00Z', now)).toBe('3 h 00');
    expect(age('2026-10-10T09:00:00Z', now)).toBe('8 d 3 h');
  });
});
