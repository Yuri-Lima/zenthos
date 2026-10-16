import { SpecSchema } from '@zenthos/domain';
import { z } from 'zod';

/**
 * One ticket whose change a human judged: merged (accepted) or closed without merge (rejected). The
 * item holds references, never the code: the runner fetches the issue and the diff at run time through
 * the ports, so private code never lands in this repository. An item from a stored run carries the spec
 * that run implemented, so the reviewer is judged on the spec the change was written against.
 */
export const GoldenItemSchema = z.object({
  ticketKey: z.string().min(1),
  pullRequest: z.object({ number: z.number().int().positive(), url: z.string().url() }),
  /** Files the change touched; the proxy truth for the spec writer's touched areas. */
  files: z.array(z.string().min(1)).min(1),
  verdict: z.enum(['accepted', 'rejected']),
  spec: SpecSchema.optional(),
});

export const GoldenDatasetSchema = z.object({
  repo: z.string().min(1),
  /** Where the items came from: the repository's merged history, or the pipeline's own stored runs. */
  source: z.enum(['history', 'runs']).default('history'),
  builtAt: z.string().datetime(),
  items: z.array(GoldenItemSchema).min(1),
});

export type GoldenItem = z.infer<typeof GoldenItemSchema>;
export type GoldenDataset = z.infer<typeof GoldenDatasetSchema>;

export const parseDataset = (input: unknown): GoldenDataset => GoldenDatasetSchema.parse(input);
