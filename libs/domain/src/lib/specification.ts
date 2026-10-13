import { z } from 'zod';
import { DomainError } from './errors.js';

/** One criterion maps to exactly one test. The test hint says how a test proves it. */
export const AcceptanceCriterionSchema = z.object({
  id: z.string().regex(/^AC-\d+$/),
  statement: z.string().min(10),
  testHint: z.string().min(1),
});

/** The spec the spec-writer agent must produce. The schema is the only definition. */
export const SpecSchema = z.object({
  ticketKey: z.string().min(1),
  problem: z.string().min(10),
  inScope: z.array(z.string().min(1)).min(1),
  outOfScope: z.array(z.string().min(1)).default([]),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema).min(1),
  touchedAreas: z.array(z.string().min(1)).min(1),
  risks: z.array(z.string().min(1)).default([]),
});

export type Spec = z.infer<typeof SpecSchema>;
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

export function parseSpec(input: unknown): Spec {
  const result = SpecSchema.safeParse(input);
  if (!result.success) {
    throw new DomainError('invalid_spec', { issues: result.error.issues });
  }
  return result.data;
}
