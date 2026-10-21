import type { EvalMetric } from '@zenthos/domain';

export type Summary = Partial<Record<EvalMetric, number>> & { items: number; failed: number };

/**
 * Keyed by `<prompt version>@<dataset>` (`spec-writer/v1@owner-repo`). The file is reviewed like code: LangFuse runs
 * and stores the experiments, the repository decides which numbers a change must keep (ADR 016).
 */
export type Baseline = Record<string, Summary>;

/** A metric may drop this much without counting as a regression: model output is not deterministic. */
export const DEFAULT_TOLERANCE = 0.05;

export type Regression = { metric: EvalMetric; baseline: number; current: number };

/**
 * Compares a run with the baseline recorded for the same prompt version. No baseline means nothing to
 * compare: the run passes and its summary becomes the baseline when the caller records it.
 */
export function findRegressions(current: Summary, baseline: Summary | undefined, tolerance = DEFAULT_TOLERANCE): Regression[] {
  if (!baseline) return [];
  const regressions: Regression[] = [];
  for (const [metric, expected] of Object.entries(baseline) as [EvalMetric | 'items' | 'failed', number][]) {
    if (metric === 'items' || metric === 'failed') continue;
    const value = current[metric];
    if (value !== undefined && value < expected - tolerance) regressions.push({ metric, baseline: expected, current: value });
  }
  return regressions;
}
