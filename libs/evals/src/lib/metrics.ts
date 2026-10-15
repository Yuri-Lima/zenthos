import type { Spec } from '@zenthos/domain';

/** Metrics where a higher value is better; the regression check compares only these. */
export const METRIC_DEFINITIONS = {
  touched_area_recall: 'Share of the files the merged change touched that fall under an area the spec named',
  criteria_per_spec: 'Acceptance criteria per spec; too few means the spec is vague',
  review_agreement: 'Share of changes where the reviewer gate agrees with the human verdict',
  review_score: 'Mean rubric score the reviewer gave',
} as const;

export type Metric = keyof typeof METRIC_DEFINITIONS;

const normalise = (path: string) => path.trim().toLowerCase().replace(/^\.?\//, '');

/**
 * A spec's touched areas are free text, usually paths or path prefixes. A file counts as covered when it
 * starts with, or contains, one of them. Prose areas never match, which is the point: a vague spec scores low.
 */
export function touchedAreaRecall(spec: Pick<Spec, 'touchedAreas'>, files: string[]): number {
  if (files.length === 0) return 0;
  const areas = spec.touchedAreas.map(normalise).filter(Boolean);
  const covered = files.filter((file) => {
    const path = normalise(file);
    return areas.some((area) => path.startsWith(area) || path.includes(area));
  });
  return covered.length / files.length;
}

/** The reviewer agrees with a human who merged when its gate passes. */
export const reviewAgreement = (gatePassed: boolean, verdict: 'accepted'): number => (gatePassed === (verdict === 'accepted') ? 1 : 0);

/** Mean of a metric over item results, ignoring items that failed before producing it. */
export function mean(values: (number | undefined)[]): number | undefined {
  const present = values.filter((value): value is number => value !== undefined);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : undefined;
}
