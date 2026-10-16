import { checkReviewThreshold, parseSpec, reviewScore, type RepoProfile, type Review, type Spec } from '@zenthos/domain';
import type { IssueTrackerPort, ReviewerPort, ScmPort, SpecWriterPort } from '@zenthos/ports';
import type { GoldenDataset, GoldenItem } from './dataset.js';
import { mean, reviewAgreement, touchedAreaRecall } from './metrics.js';
import type { Summary } from './regression.js';

export type SuiteOptions = {
  /** First N items in dataset order, so a limited run compares with a baseline built the same way. */
  limit?: number;
  /** Items judged at once; keep it small, every item is one or more model calls. */
  concurrency?: number;
};

export type SpecItemResult = { ticketKey: string; spec?: Spec; touched_area_recall?: number; criteria_per_spec?: number; error?: string };
export type ReviewItemResult = { ticketKey: string; review?: Review; review_score?: number; review_agreement?: number; error?: string };
export type SuiteResult<Item> = { suite: 'spec' | 'review'; results: Item[]; summary: Summary };

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Spec suite: draft a spec per ticket and measure it against the files the merged change touched. */
export async function runSpecSuite(
  deps: { issueTracker: IssueTrackerPort; specWriter: SpecWriterPort; repoContext: string },
  dataset: GoldenDataset,
  options: SuiteOptions = {},
): Promise<SuiteResult<SpecItemResult>> {
  const results = await mapLimited(select(dataset, options), options.concurrency, async (item): Promise<SpecItemResult> => {
    try {
      const ticket = await deps.issueTracker.getTicket(item.ticketKey);
      const spec = parseSpec(await deps.specWriter.draftSpec({ ticket, repoContext: deps.repoContext }));
      return { ticketKey: item.ticketKey, spec, touched_area_recall: touchedAreaRecall(spec, item.files), criteria_per_spec: spec.acceptanceCriteria.length };
    } catch (error) {
      return { ticketKey: item.ticketKey, error: describe(error) };
    }
  });
  return {
    suite: 'spec',
    results,
    summary: {
      items: results.length,
      failed: results.filter((r) => r.error).length,
      touched_area_recall: mean(results.map((r) => r.touched_area_recall)),
      criteria_per_spec: mean(results.map((r) => r.criteria_per_spec)),
    },
  };
}

/**
 * Review suite: the reviewer judges each change against its spec and must agree with the human verdict.
 * History items need a spec drafted now, so they cost both agents; run items carry their own.
 */
export async function runReviewSuite(
  deps: { issueTracker: IssueTrackerPort; specWriter: SpecWriterPort; scm: ScmPort; reviewer: ReviewerPort; repoContext: string },
  dataset: GoldenDataset,
  profile: RepoProfile,
  options: SuiteOptions = {},
): Promise<SuiteResult<ReviewItemResult>> {
  const results = await mapLimited(select(dataset, options), options.concurrency, async (item): Promise<ReviewItemResult> => {
    try {
      // An item from a stored run brings the spec its change was written against; history items get one drafted now.
      const spec = item.spec ?? parseSpec(await deps.specWriter.draftSpec({ ticket: await deps.issueTracker.getTicket(item.ticketKey), repoContext: deps.repoContext }));
      const diff = await deps.scm.readPullRequestDiff(profile, item.pullRequest);
      const review = await deps.reviewer.review({ spec, diff, gates: [], profile });
      const gate = checkReviewThreshold(review, profile.policy);
      return { ticketKey: item.ticketKey, review, review_score: reviewScore(review), review_agreement: reviewAgreement(gate.passed, item.verdict) };
    } catch (error) {
      return { ticketKey: item.ticketKey, error: describe(error) };
    }
  });
  return {
    suite: 'review',
    results,
    summary: {
      items: results.length,
      failed: results.filter((r) => r.error).length,
      review_score: mean(results.map((r) => r.review_score)),
      review_agreement: mean(results.map((r) => r.review_agreement)),
    },
  };
}

const select = (dataset: GoldenDataset, { limit }: SuiteOptions): GoldenItem[] => (limit ? dataset.items.slice(0, limit) : dataset.items);

/** Runs `fn` over `items` with at most `limit` in flight; results keep the input order. */
async function mapLimited<T, R>(items: T[], limit = 2, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
