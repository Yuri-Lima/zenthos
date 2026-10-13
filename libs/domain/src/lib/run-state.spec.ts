import { DomainError } from './errors.js';
import { isTerminal, transition, type RunEvent, type RunState } from './run-state.js';

describe('transition', () => {
  it('walks the happy path from intake to done', () => {
    const path: RunEvent[] = [
      'spec_drafted',
      'spec_approved',
      'implemented',
      'gates_passed',
      'review_passed',
      'mr_opened',
      'verified',
      'merged',
    ];
    const end = path.reduce((state, event) => transition(state, event), 'intake' as RunState);
    expect(end).toBe('done');
  });

  it('sends a failed gate back to spec_approved for a retry', () => {
    expect(transition('implemented', 'gates_failed')).toBe('spec_approved');
  });

  it('escalates to needs_human and resumes at spec_approved', () => {
    expect(transition('gates_passed', 'escalated')).toBe('needs_human');
    expect(transition('needs_human', 'human_resumed')).toBe('spec_approved');
  });

  it('accepts failed from any non-terminal state', () => {
    expect(transition('mr_opened', 'failed')).toBe('failed');
  });

  it('rejects an event the state does not know, with the error code', () => {
    expect(() => transition('intake', 'merged')).toThrow(DomainError);
    try {
      transition('intake', 'merged');
    } catch (error) {
      expect((error as DomainError).code).toBe('invalid_transition');
    }
  });

  it('rejects every event from a terminal state', () => {
    expect(isTerminal('done')).toBe(true);
    expect(() => transition('done', 'failed')).toThrow(DomainError);
  });
});

describe('transition while waiting for a spec decision', () => {
  it('escalates when nobody decides in time', () => {
    expect(transition('spec_drafted', 'escalated')).toBe('needs_human');
  });

  it('returns to intake on rejection so the spec can be redrafted', () => {
    expect(transition('spec_drafted', 'spec_rejected')).toBe('intake');
    expect(transition('intake', 'escalated')).toBe('needs_human');
  });
});
