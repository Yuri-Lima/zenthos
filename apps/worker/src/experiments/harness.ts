import { readFile } from 'node:fs/promises';
import { RegressionError, type ExperimentItem, type ExperimentResult, type RunnerContext } from '@langfuse/client';
import { langfuseCallbacks } from '@zenthos/adapter-langfuse';
import { profileForTicket } from '@zenthos/application';
import type { EvalSuite } from '@zenthos/domain';
import { findRegressions, fromDatasetItem, issueNumber, stampRunScores, summarize, type Baseline, type ExperimentDefinition, type Regression, type Summary } from '@zenthos/evals';
import { github, issueTracker, loadWorkerConfig, reviewer, scm, specWriter, stores } from '../composition.js';

/** Reviewed like code (ADR 016): LangFuse runs and keeps the experiments, this file says which numbers must hold. */
export const BASELINE_FILE = 'libs/evals/baseline.json';

export const readBaseline = async (): Promise<Baseline> => JSON.parse(await readFile(BASELINE_FILE, 'utf8').catch(() => '{}')) as Baseline;

/**
 * The worker's adapters for one eval run. The agents trace as `eval` beside the runs' sessions (ADR 015), through
 * the OpenTelemetry provider the caller registered: the LangFuse action's in CI, the eval command's locally.
 */
export async function evalDeps(ticketKey: string) {
  const config = loadWorkerConfig();
  const store = await stores(config);
  const clients = github(config, store);
  return {
    profile: await profileForTicket(store.profiles, ticketKey),
    issueTracker: issueTracker(config, clients),
    scm: scm(config, clients),
    specWriter: await specWriter(config, langfuseCallbacks, 'eval'),
    reviewer: await reviewer(config, langfuseCallbacks, 'eval'),
    repoContext: config.REPO_CONTEXT_FILE ? await readFile(config.REPO_CONTEXT_FILE, 'utf8') : '',
    /** In-memory agents prove the plumbing, not the prompts; their scores never count as the latest eval. */
    dryRun: config.SPEC_WRITER === 'memory' || config.REVIEWER === 'memory',
    close: store.close,
  };
}

type DatasetItemLike = ExperimentItem & { datasetName?: string };

/** The dataset's items in issue order, cut to `EVAL_LIMIT` when set, so "the first N" is the same N on every run. */
export function selectItems(context: RunnerContext): DatasetItemLike[] {
  const items = ((context.data ?? []) as DatasetItemLike[])
    .map((item) => ({ item, issue: issueNumber(fromDatasetItem(item).ticketKey) }))
    .sort((a, b) => a.issue - b.issue)
    .map(({ item }) => item);
  if (items.length === 0) throw new Error('no dataset items: pass a dataset (dataset_name in CI, the dataset argument locally)');
  const limit = process.env['EVAL_LIMIT'] ? Number(process.env['EVAL_LIMIT']) : undefined;
  if (limit !== undefined && !(Number.isInteger(limit) && limit >= 1)) throw new Error(`EVAL_LIMIT must be a whole number of items, at least 1; got ${process.env['EVAL_LIMIT']}`);
  return limit ? items.slice(0, limit) : items;
}

export type GatedRun = { result: ExperimentResult; summary: Summary; key: string; regressions: Regression[] };

/**
 * Runs the experiment through LangFuse on the selected items, then compares it with the reviewed baseline for
 * `<prompt version>@<dataset>`; no baseline yet means nothing to compare with. The caller decides what a regression
 * does: `failOnRegression` for the action, the eval command to report or to record a deliberate new bar.
 */
export async function runGated<Output>(context: RunnerContext, suite: EvalSuite, definition: ExperimentDefinition<Output>, dryRun: boolean): Promise<GatedRun> {
  const data = selectItems(context);
  const datasetName = data[0].datasetName ?? 'local';
  const result = await context.runExperiment({ ...stampRunScores(definition, datasetName, dryRun), data, metadata: { ...context.metadata, ...definition.metadata, dataset: datasetName } });
  const summary = summarize(suite, result);
  const key = `${definition.metadata.promptVersion}@${datasetName}`;
  const baseline = (await readBaseline())[key];
  const regressions = findRegressions(summary, baseline);
  console.log(JSON.stringify({ key, summary, baseline: baseline ?? null, regressions, datasetRunUrl: result.datasetRunUrl ?? null }, null, 2));
  return { result, summary, key, regressions };
}

export const describeRegressions = ({ key, regressions }: GatedRun) =>
  `regression against ${key}: ${regressions.map((r) => `${r.metric} ${r.current.toFixed(3)} < ${r.baseline.toFixed(3)}`).join(', ')}`;

/** For the LangFuse action: LangFuse's RegressionError fails the CI job and marks the pull-request comment. */
export function failOnRegression(run: GatedRun): ExperimentResult {
  const [first] = run.regressions;
  if (first) throw new RegressionError({ result: run.result, metric: first.metric, value: first.current, threshold: first.baseline, message: describeRegressions(run) });
  return run.result;
}
