import { checkReviewThreshold, EVAL_METRICS, parseSpec, reviewScore, type EvalMetric, type EvalSuite, type RepoProfile, type Review, type Spec } from '@zenthos/domain';
import type { IssueTrackerPort, ReviewerPort, ScmPort, SpecWriterPort } from '@zenthos/ports';
import { fromDatasetItem } from './dataset.js';
import { mean, reviewAgreement, touchedAreaRecall } from './metrics.js';
import type { Summary } from './regression.js';

/**
 * The two eval suites as experiment definitions (ADR 016): a task per item, item evaluators that score it, run
 * evaluators that average the scores. The shapes match LangFuse's `runExperiment` structurally, so this library
 * stays free of vendor imports; the worker's experiment scripts hand these to LangFuse.
 */
export type Score = { name: string; value: number; comment?: string; metadata?: Record<string, string> };
type ItemParams = { input?: unknown; expectedOutput?: unknown };
type ItemResult = { evaluations: { name: string; value: unknown }[] };

export type ExperimentDefinition<Output> = {
  name: string;
  description: string;
  metadata: { suite: EvalSuite; promptVersion: string };
  task: (item: ItemParams) => Promise<Output>;
  evaluators: ((params: ItemParams & { output: Output }) => Promise<Score[]>)[];
  runEvaluators: ((params: { itemResults: ItemResult[] }) => Promise<Score[]>)[];
  maxConcurrency: number;
};

/** Items judged at once; every item is one or more model calls. */
const CONCURRENCY = 2;

/** A run-level score is the mean of its item scores, named `mean_<metric>` so it never reads as one item's score. */
export const runScoreName = (metric: EvalMetric) => `mean_${metric}`;

const metricsOf = (suite: EvalSuite) => (Object.keys(EVAL_METRICS) as EvalMetric[]).filter((metric) => EVAL_METRICS[metric].suite === suite);

const averages = (suite: EvalSuite) => async ({ itemResults }: { itemResults: ItemResult[] }): Promise<Score[]> =>
  metricsOf(suite).flatMap((metric) => {
    const value = mean(itemResults.map((r) => r.evaluations.find((e) => e.name === metric)?.value).filter((v): v is number => typeof v === 'number'));
    return value === undefined ? [] : [{ name: runScoreName(metric), value }];
  });

/** Spec suite: draft a spec per ticket, score it against the files the merged change touched. */
export function specExperiment(deps: { issueTracker: IssueTrackerPort; specWriter: SpecWriterPort; repoContext: string }, promptVersion: string): ExperimentDefinition<Spec> {
  return {
    name: 'spec suite',
    description: 'Drafts a spec per merged ticket; touched-area recall against the files the merge changed',
    metadata: { suite: 'spec', promptVersion },
    task: async (item) => {
      const { ticketKey } = fromDatasetItem(item);
      return parseSpec((await deps.specWriter.draftSpec({ ticket: await deps.issueTracker.getTicket(ticketKey), repoContext: deps.repoContext })).spec);
    },
    evaluators: [
      async ({ output, ...item }) => [
        { name: 'touched_area_recall', value: touchedAreaRecall(output, fromDatasetItem(item).files), comment: output.touchedAreas.join(', ') },
        { name: 'criteria_per_spec', value: output.acceptanceCriteria.length },
      ],
    ],
    runEvaluators: [averages('spec')],
    maxConcurrency: CONCURRENCY,
  };
}

export type ReviewOutput = { review: Review; gatePassed: boolean };

/**
 * Review suite: the reviewer judges each change against its spec and must agree with the human verdict. Items from
 * stored runs carry the spec the change was written against; history items get one drafted now (both agents cost).
 */
export function reviewExperiment(
  deps: { issueTracker: IssueTrackerPort; specWriter: SpecWriterPort; scm: ScmPort; reviewer: ReviewerPort; repoContext: string },
  profile: RepoProfile,
  promptVersion: string,
): ExperimentDefinition<ReviewOutput> {
  return {
    name: 'review suite',
    description: 'Reviews each judged change against its spec; agreement with the human merge or close',
    metadata: { suite: 'review', promptVersion },
    task: async (item) => {
      const golden = fromDatasetItem(item);
      const spec = golden.spec ?? parseSpec((await deps.specWriter.draftSpec({ ticket: await deps.issueTracker.getTicket(golden.ticketKey), repoContext: deps.repoContext })).spec);
      const diff = await deps.scm.readPullRequestDiff(profile, golden.pullRequest);
      const { review } = await deps.reviewer.review({ spec, diff, gates: [], profile });
      return { review, gatePassed: checkReviewThreshold(review, profile.policy).passed };
    },
    evaluators: [
      async ({ output, ...item }) => [
        { name: 'review_score', value: reviewScore(output.review), comment: output.review.summary },
        { name: 'review_agreement', value: reviewAgreement(output.gatePassed, fromDatasetItem(item).verdict) },
      ],
    ],
    runEvaluators: [averages('review')],
    maxConcurrency: CONCURRENCY,
  };
}

/**
 * Stamps every run-level score with its suite, prompt version and dataset, and marks a dry run (in-memory agents).
 * LangFuse keeps a score's metadata and the experiment run it belongs to, so the metrics page reads the latest
 * real results from the scores alone and skips dry runs.
 */
export function stampRunScores<Output>(definition: ExperimentDefinition<Output>, dataset: string, dryRun: boolean): ExperimentDefinition<Output> {
  const metadata = { ...definition.metadata, dataset, ...(dryRun ? { dryRun: 'true' } : {}) };
  return {
    ...definition,
    runEvaluators: definition.runEvaluators.map((evaluate) => async (params) => (await evaluate(params)).map((score) => ({ ...score, metadata: { ...score.metadata, ...metadata } }))),
  };
}

/** The run as the baseline file records it: the run-level means, how many items ran, how many produced no output. */
export function summarize(suite: EvalSuite, result: { itemResults: (ItemResult & { output?: unknown })[]; runEvaluations: { name: string; value: unknown }[] }): Summary {
  const summary: Summary = { items: result.itemResults.length, failed: result.itemResults.filter((r) => r.output === undefined || r.output === null).length };
  for (const metric of metricsOf(suite)) {
    const value = result.runEvaluations.find((e) => e.name === runScoreName(metric))?.value;
    if (typeof value === 'number') summary[metric] = value;
  }
  return summary;
}
