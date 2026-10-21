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

/** One LangFuse dataset per repository and source: `owner-repo` for merged history, `owner-repo-runs` for stored runs. */
export const datasetNameFor = (repo: string, source: GoldenDataset['source']): string => `${repo.replace('/', '-')}${source === 'runs' ? '-runs' : ''}`;

/** What the task gets (the ticket and, for a run, its spec) and what the evaluators judge against (files, verdict). */
export type ItemInput = Pick<GoldenItem, 'ticketKey' | 'pullRequest' | 'spec'>;
export type ItemExpected = Pick<GoldenItem, 'files' | 'verdict'>;

/**
 * A golden item as a LangFuse dataset item. The id is stable per dataset and ticket, so building the dataset again
 * upserts instead of duplicating; ids are unique across a LangFuse project, hence the dataset name in it.
 */
export function toDatasetItem(datasetName: string, { files, verdict, ...input }: GoldenItem) {
  return { id: `${datasetName}:${input.ticketKey}`, datasetName, input: input satisfies ItemInput, expectedOutput: { files, verdict } satisfies ItemExpected };
}

/** Back from LangFuse, validated: an item edited by hand in the UI fails here, not halfway through a run. */
export const fromDatasetItem = ({ input, expectedOutput }: { input?: unknown; expectedOutput?: unknown }): GoldenItem =>
  GoldenItemSchema.parse({ ...(input as object), ...(expectedOutput as object) });

/** Issue number of a ticket key, so "the first N items" means the same N on every run. */
export const issueNumber = (ticketKey: string): number => Number(ticketKey.slice(ticketKey.lastIndexOf('#') + 1));
