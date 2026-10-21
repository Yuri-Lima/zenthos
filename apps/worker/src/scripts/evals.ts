/**
 * The regression evals on LangFuse Datasets and Experiments (ADR 016), composed from the worker's adapters.
 *
 *   pnpm nx run @zenthos/worker:eval-dataset -- owner/repo               merged history, read with gh → LangFuse dataset owner-repo
 *   pnpm nx run @zenthos/worker:eval-dataset -- owner/repo --from runs   the pipeline's judged runs → owner-repo-runs
 *   pnpm nx run @zenthos/worker:eval -- spec   owner/repo [--limit 10] [--record]
 *   pnpm nx run @zenthos/worker:eval -- review owner/repo [--dataset runs] [--limit 5] [--record]
 *
 * A run goes through the same experiment scripts the LangFuse action runs in CI (apps/worker/src/experiments),
 * prints LangFuse's summary and the dataset-run link, and exits 1 on a regression against libs/evals/baseline.json.
 * `--record` writes the run's summary as the new baseline for its key: a deliberate commit, reviewed like code.
 */
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { LangfuseClient, RunnerContext } from '@langfuse/client';
import { startLangfuseTracing } from '@zenthos/adapter-langfuse';
import { profileForTicket } from '@zenthos/application';
import { buildRunsDataset, datasetNameFor, parseDataset, toDatasetItem, type GoldenDataset } from '@zenthos/evals';
import { github, loadWorkerConfig, scm, stores } from '../composition.js';
import type { WorkerConfig } from '../config.js';
import { BASELINE_FILE, describeRegressions, readBaseline } from '../experiments/harness.js';
import { runReviewSuite } from '../experiments/review-suite.js';
import { runSpecSuite } from '../experiments/spec-suite.js';

const [command, ...rest] = process.argv.slice(2);
const option = (name: string) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
const record = rest.includes('--record');
const fromRuns = option('--from') === 'runs' || option('--dataset') === 'runs';
const valueIndexes = new Set(['--limit', '--from', '--dataset'].map((flag) => rest.indexOf(flag)).filter((i) => i >= 0).map((i) => i + 1));
const positional = rest.filter((arg, index) => !arg.startsWith('--') && !valueIndexes.has(index));

/** The LangFuse keys and URL the evals need; the same three the worker traces with. */
function langfuseConfig(config: WorkerConfig) {
  if (!config.LANGFUSE_PUBLIC_KEY || !config.LANGFUSE_SECRET_KEY) throw new Error('the evals live in LangFuse: set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY (see .env.example)');
  return { publicKey: config.LANGFUSE_PUBLIC_KEY, secretKey: config.LANGFUSE_SECRET_KEY, baseUrl: config.LANGFUSE_BASE_URL };
}

/**
 * Merged pull requests that close exactly one issue, read through the gh CLI the developer is signed into.
 * A pull request claims an issue with a `Closes #N` line or a `(#N)` in its title; release pull requests
 * that bundle several are skipped, and the first pull request merged for an issue is the one kept.
 */
async function buildHistoryDataset(repo: string): Promise<GoldenDataset> {
  const { stdout } = await promisify(execFile)('gh', ['pr', 'list', '--repo', repo, '--state', 'merged', '--limit', '200', '--json', 'number,url,title,body,files'], { maxBuffer: 64 * 1024 * 1024 });
  const pulls = JSON.parse(stdout) as { number: number; url: string; title: string; body: string; files: { path: string }[] }[];
  const byIssue = new Map<number, GoldenDataset['items'][number]>();
  for (const pull of pulls.sort((a, b) => a.number - b.number)) {
    const issues = new Set([...(pull.body ?? '').matchAll(/^(?:closes|fixes|resolves) #(\d+)\s*$/gim), ...pull.title.matchAll(/\(#(\d+)\)/g)].map((m) => Number(m[1])));
    if (issues.size !== 1 || pull.title.startsWith('release') || pull.files.length === 0) continue;
    const [issue] = issues;
    if (!byIssue.has(issue)) byIssue.set(issue, { ticketKey: `${repo}#${issue}`, pullRequest: { number: pull.number, url: pull.url }, files: pull.files.map((f) => f.path), verdict: 'accepted' });
  }
  const items = [...byIssue.entries()].sort(([a], [b]) => a - b).map(([, item]) => item);
  return parseDataset({ repo, builtAt: new Date().toISOString(), items });
}

/** Stored runs whose pull request a human merged or closed, through the worker's own stores and SCM. */
async function buildRunsDatasetFor(config: WorkerConfig, repo: string): Promise<GoldenDataset | undefined> {
  const store = await stores(config);
  try {
    const profile = await profileForTicket(store.profiles, `${repo}#0`);
    const { dataset, skipped } = await buildRunsDataset({ runs: store.runs, scm: scm(config, github(config, store)) }, profile);
    for (const { ticketKey, reason } of skipped) console.log(`skipped ${ticketKey}: ${reason}`);
    return dataset;
  } finally {
    await store.close();
  }
}

/** Creates the dataset when missing and upserts every item by its stable id; items no longer built are left as they are. */
async function upsertDataset(client: LangfuseClient, dataset: GoldenDataset): Promise<string> {
  const name = datasetNameFor(dataset.repo, dataset.source);
  await client.api.datasets.create({ name, description: `${dataset.source === 'runs' ? 'Judged pipeline runs' : 'Merged history'} of ${dataset.repo}`, metadata: { repo: dataset.repo, source: dataset.source } });
  for (const item of dataset.items) await client.api.datasetItems.create(toDatasetItem(name, item));
  return name;
}

async function run(suite: 'spec' | 'review', repo: string) {
  const keys = langfuseConfig(loadWorkerConfig());
  const client = new LangfuseClient(keys);
  const trace = startLangfuseTracing(keys);
  const limit = option('--limit');
  if (limit) process.env['EVAL_LIMIT'] = limit;
  try {
    const dataset = await client.dataset.get(datasetNameFor(repo, fromRuns ? 'runs' : 'history'));
    const context = new RunnerContext({ client, data: dataset.items, metadata: { trigger: 'cli' } });
    const outcome = suite === 'spec' ? await runSpecSuite(context) : await runReviewSuite(context);
    console.log(await outcome.result.format());
    // --record sets the bar even below the old one: lowering it is a deliberate commit, reviewed like code.
    if (record) {
      await writeFile(BASELINE_FILE, `${JSON.stringify({ ...(await readBaseline()), [outcome.key]: outcome.summary }, null, 2)}\n`);
      console.log(`baseline recorded for ${outcome.key} in ${BASELINE_FILE}`);
    } else if (outcome.regressions.length) {
      console.error(describeRegressions(outcome));
      process.exitCode = 1;
    }
  } finally {
    await trace.shutdown();
    await client.shutdown();
  }
}

const [repoArg] = positional;
if (command === 'dataset' && repoArg) {
  const config = loadWorkerConfig();
  const dataset = fromRuns ? await buildRunsDatasetFor(config, repoArg) : await buildHistoryDataset(repoArg);
  if (!dataset) {
    console.log('no stored run has a pull request a human has merged or closed yet; nothing written');
  } else {
    const client = new LangfuseClient(langfuseConfig(config));
    const name = await upsertDataset(client, dataset);
    await client.shutdown();
    console.log(`${dataset.items.length} items upserted into the LangFuse dataset ${name}`);
  }
} else if (command === 'run' && (positional[0] === 'spec' || positional[0] === 'review') && positional[1]) {
  await run(positional[0], positional[1]);
} else {
  console.error('usage: evals.ts dataset owner/repo [--from runs] | evals.ts run spec|review owner/repo [--dataset runs] [--limit N] [--record]');
  process.exit(1);
}
