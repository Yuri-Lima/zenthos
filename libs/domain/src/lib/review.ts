import { z } from 'zod';
import { DomainError } from './errors.js';
import { fail, pass, type GateResult } from './gate.js';
import type { RunPolicy } from './policies.js';

/** The rubric, defined once. The reviewer scores each line; humans read the same words on the pull request. */
export const REVIEW_RUBRIC = {
  correctness: 'The change does what the acceptance criteria say, and nothing the spec put out of scope',
  spec_coverage: 'Every acceptance criterion has an automated test that proves it',
  readability: 'A reviewer can follow the change without the ticket: names say what, comments say why',
  engineering_rules: 'One source of truth, no duplication, no needless abstraction, no edits to tooling or unrelated files',
} as const;

export type RubricKey = keyof typeof REVIEW_RUBRIC;
export const RUBRIC_KEYS = Object.keys(REVIEW_RUBRIC) as RubricKey[];

export const RubricScoreSchema = z.object({
  /** 1 = fails the line outright, 5 = nothing to improve. */
  score: z.number().int().min(1).max(5),
  evidence: z.string().min(10),
});

export const FindingSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().positive().optional(),
  severity: z.enum(['blocker', 'major', 'minor']),
  message: z.string().min(5),
});

export const ReviewSchema = z.object({
  scores: z.object({
    correctness: RubricScoreSchema,
    spec_coverage: RubricScoreSchema,
    readability: RubricScoreSchema,
    engineering_rules: RubricScoreSchema,
  }),
  findings: z.array(FindingSchema),
  summary: z.string().min(10),
});

export type Review = z.infer<typeof ReviewSchema>;
export type RubricScore = z.infer<typeof RubricScoreSchema>;
export type Finding = z.infer<typeof FindingSchema>;

export function parseReview(input: unknown): Review {
  const result = ReviewSchema.safeParse(input);
  if (!result.success) throw new DomainError('invalid_review', { issues: result.error.issues });
  return result.data;
}

/** Mean of the four rubric scores, 1 to 5. */
export const reviewScore = (review: Review): number =>
  RUBRIC_KEYS.reduce((sum, key) => sum + review.scores[key].score, 0) / RUBRIC_KEYS.length;

/** A blocker finding fails on its own; otherwise the mean must reach the policy threshold. */
export function checkReviewThreshold(review: Review, policy: RunPolicy): GateResult {
  const blockers = review.findings.filter((finding) => finding.severity === 'blocker');
  if (blockers.length > 0) {
    return fail('review_threshold', `${blockers.length} blocker finding(s): ${blockers.map((b) => `${b.file}: ${b.message}`).join('; ')}`);
  }
  const score = reviewScore(review);
  return score >= policy.reviewThreshold
    ? pass('review_threshold')
    : fail('review_threshold', `review score ${score.toFixed(2)} is below the threshold ${policy.reviewThreshold}`);
}
