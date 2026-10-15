import { z } from 'zod';

/**
 * One closed ticket whose change a human accepted by merging. The item holds references, never the
 * code: the runner fetches the issue and the diff at run time through the ports, so private code never
 * lands in this repository.
 */
export const GoldenItemSchema = z.object({
  ticketKey: z.string().min(1),
  pullRequest: z.object({ number: z.number().int().positive(), url: z.string().url() }),
  /** Files the merged change touched; the proxy truth for the spec writer's touched areas. */
  files: z.array(z.string().min(1)).min(1),
  verdict: z.literal('accepted'),
});

export const GoldenDatasetSchema = z.object({
  repo: z.string().min(1),
  builtAt: z.string().datetime(),
  items: z.array(GoldenItemSchema).min(1),
});

export type GoldenItem = z.infer<typeof GoldenItemSchema>;
export type GoldenDataset = z.infer<typeof GoldenDatasetSchema>;

export const parseDataset = (input: unknown): GoldenDataset => GoldenDatasetSchema.parse(input);
