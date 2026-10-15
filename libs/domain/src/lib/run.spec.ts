import { applyEvent, createRun } from './run.js';
import type { Ticket } from './ticket.js';

const ticket: Ticket = {
  key: 'owner/repo#1',
  title: 'Add a thing',
  body: 'Please add the thing',
  url: 'https://github.com/owner/repo/issues/1',
  labels: [],
};

describe('run', () => {
  it('starts in intake with an empty history', () => {
    const run = createRun(ticket, { now: new Date('2026-10-13T10:00:00Z') });
    expect(run.state).toBe('intake');
    expect(run.history).toEqual([]);
    expect(run.createdAt).toBe('2026-10-13T10:00:00.000Z');
  });

  it('returns a new run and leaves the old one untouched', () => {
    const before = createRun(ticket);
    const after = applyEvent(before, 'spec_drafted', new Date('2026-10-13T10:05:00Z'));
    expect(before.state).toBe('intake');
    expect(after.state).toBe('spec_drafted');
    expect(after.history).toEqual([
      { event: 'spec_drafted', from: 'intake', to: 'spec_drafted', at: '2026-10-13T10:05:00.000Z' },
    ]);
  });
});
