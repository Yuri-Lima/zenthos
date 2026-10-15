import { findRegressions } from './regression.js';
import { mean, reviewAgreement, touchedAreaRecall } from './metrics.js';

describe('metrics', () => {
  it('counts a file as covered when a touched area is its prefix or part of its path', () => {
    const files = ['src/components/ui/selecao.tsx', 'src/components/agenda/agenda-sheet.tsx', 'e2e/tests/rolagem.spec.ts', 'README.md'];
    expect(touchedAreaRecall({ touchedAreas: ['src/components/ui/selecao.tsx', 'agenda', 'e2e/tests'] }, files)).toBe(0.75);
    expect(touchedAreaRecall({ touchedAreas: ['the selector component'] }, files)).toBe(0);
    expect(touchedAreaRecall({ touchedAreas: ['src'] }, [])).toBe(0);
  });

  it('agrees with a human merge only when the gate passes', () => {
    expect(reviewAgreement(true, 'accepted')).toBe(1);
    expect(reviewAgreement(false, 'accepted')).toBe(0);
  });

  it('averages what is present', () => {
    expect(mean([1, undefined, 0])).toBe(0.5);
    expect(mean([undefined])).toBeUndefined();
  });
});

describe('findRegressions', () => {
  const baseline = { items: 10, failed: 0, touched_area_recall: 0.8, criteria_per_spec: 4 };

  it('passes within the tolerance and without a baseline', () => {
    expect(findRegressions({ items: 10, failed: 0, touched_area_recall: 0.76, criteria_per_spec: 4.5 }, baseline)).toEqual([]);
    expect(findRegressions({ items: 10, failed: 0, touched_area_recall: 0.1 }, undefined)).toEqual([]);
  });

  it('reports every metric that dropped beyond the tolerance', () => {
    expect(findRegressions({ items: 10, failed: 2, touched_area_recall: 0.6, criteria_per_spec: 3.9 }, baseline, 0.05)).toEqual([
      { metric: 'touched_area_recall', baseline: 0.8, current: 0.6 },
      { metric: 'criteria_per_spec', baseline: 4, current: 3.9 },
    ]);
  });
});
