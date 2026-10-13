import { DomainError } from './errors.js';
import { parseSpec } from './specification.js';

const valid = {
  ticketKey: 'owner/repo#1',
  problem: 'Users cannot filter the list by label',
  inScope: ['label filter on the list page'],
  acceptanceCriteria: [
    { id: 'AC-1', statement: 'Selecting a label shows only matching rows', testHint: 'Playwright: pick a label, count rows' },
  ],
  touchedAreas: ['src/routes/list'],
};

describe('parseSpec', () => {
  it('accepts a valid spec and fills the defaults', () => {
    const spec = parseSpec(valid);
    expect(spec.outOfScope).toEqual([]);
    expect(spec.risks).toEqual([]);
  });

  it('rejects a spec without acceptance criteria, with the error code', () => {
    try {
      parseSpec({ ...valid, acceptanceCriteria: [] });
      throw new Error('expected parseSpec to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('invalid_spec');
    }
  });
});
