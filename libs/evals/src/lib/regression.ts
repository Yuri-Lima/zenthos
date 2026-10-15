import type { Metric } from './metrics.js';

export type Summary = Partial<Record<Metric, number>> & { items: number; failed: number };

/** Keyed by prompt version (`spec-writer/v1`), so a prompt change under the same version is compared with it. */
export type Baseline = Record<string, Summary>;

/** A metric may drop this much without counting as a regression: model output is not deterministic. */
export const DEFAULT_TOLERANCE = 0.05;

export type Regression = { metric: Metric; baseline: number; current: number };

/**
 * Compares a run with the baseline recorded for the same prompt version. No baseline means nothing to
 * compare: the run passes and its summary becomes the baseline when the caller records it.
 */
export function findRegressions(current: Summary, baseline: Summary | undefined, tolerance = DEFAULT_TOLERANCE): Regression[] {
  if (!baseline) return [];
  const regressions: Regression[] = [];
  for (const [metric, expected] of Object.entries(baseline) as [Metric | 'items' | 'failed', number][]) {
    if (metric === 'items' || metric === 'failed') continue;
    const value = current[metric];
    if (value !== undefined && value < expected - tolerance) regressions.push({ metric, baseline: expected, current: value });
  }
  return regressions;
}
