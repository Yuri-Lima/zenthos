/**
 * The regression evals, composed from the same adapters as the worker.
 *
 *   pnpm nx run @zenthos/worker:eval-dataset -- owner/repo               merged history, with gh → libs/evals/data/<owner>-<repo>.json
 *   pnpm nx run @zenthos/worker:eval-dataset -- owner/repo --from runs   the pipeline's own stored runs → <owner>-<repo>-runs.json
 *   pnpm nx run @zenthos/worker:eval -- spec   owner/repo [--limit 10] [--record]
 *   pnpm nx run @zenthos/worker:eval -- review owner/repo [--dataset runs] [--limit 5] [--record]
 *
 * A run prints its summary, compares it with libs/evals/baseline.json under `<prompt version>@<dataset>` and
 * exits 1 on a regression. `--record` writes the summary as the new baseline for that key: a deliberate
 * commit, reviewed like code. Item results go to libs/evals/results/ (ignored by git).
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { REVIEWER_VERSION, SPEC_WRITER_VERSION } from '@zenthos/agents';
import { profileForTicket } from '@zenthos/application';
import { buildRunsDataset, findRegressions, parseDataset, runReviewSuite, runSpecSuite, type Baseline, type GoldenDataset } from '@zenthos/evals';
import { github, issueTracker, loadWorkerConfig, reviewer, scm, specWriter, stores, tracing } from '../composition.js';

const DATA_DIR = 'libs/evals/data';
const BASELINE_FILE = 'libs/evals/baseline.json';
const RESULTS_DIR = 'libs/evals/results';

const [command, ...rest] = process.argv.slice(2);
const limitIndex = rest.indexOf('--limit');
const limit = limitIndex >= 0 ? Number(rest[limitIndex + 1]) : undefined;
if (limit !== undefined && !(Number.isInteger(limit) && limit >= 1)) {
  console.error(`--limit must be a whole number of items, at least 1; got ${rest[limitIndex + 1]}`);
  process.exit(1);
}
const record = rest.includes('--record');
const fromRuns = rest.includes('--from') ? rest[rest.indexOf('--from') + 1] === 'runs' : rest.includes('--dataset') && rest[rest.indexOf('--dataset') + 1] === 'runs';
const valueIndexes = new Set([limitIndex, rest.indexOf('--from'), rest.indexOf('--dataset')].filter((i) => i >= 0).map((i) => i + 1));
const positional = rest.filter((arg, index) => !arg.startsWith('--') && !valueIndexes.has(index));

const datasetName = (repo: string) => `${repo.replace('/', '-')}${fromRuns ? '-runs' : ''}`;
const datasetFile = (repo: string) => `${DATA_DIR}/${datasetName(repo)}.json`;

/**
 * Merged pull requests that close exactly one issue, read through the gh CLI the developer is signed into.
 * A pull request claims an issue with a `Closes #N` line or a `(#N)` in its title; release pull requests
 * that bundle several are skipped, and the first pull request merged for an issue is the one kept.
 */
async function buildDataset(repo: string): Promise<GoldenDataset> {
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

async function readBaseline(): Promise<Baseline> {
  return JSON.parse(await readFile(BASELINE_FILE, 'utf8').catch(() => '{}')) as Baseline;
}

async function run(suite: string, repo: string) {
  const dataset = parseDataset(JSON.parse(await readFile(datasetFile(repo), 'utf8')));
  if (suite === 'spec' && dataset.source === 'runs') throw new Error('the spec suite measures drafted specs against history; use the history dataset');
  const config = loadWorkerConfig();
  const trace = tracing(config);
  const store = await stores(config);
  const clients = github(config, store);
  const repoContext = config.REPO_CONTEXT_FILE ? await readFile(config.REPO_CONTEXT_FILE, 'utf8') : '';
  const profile = await profileForTicket(store.profiles, dataset.items[0].ticketKey);
  const deps = { issueTracker: issueTracker(config, clients), specWriter: await specWriter(config, trace), scm: scm(config, clients), reviewer: await reviewer(config, trace), repoContext };
  try {
    const version = `${suite === 'spec' ? SPEC_WRITER_VERSION : REVIEWER_VERSION}@${datasetName(repo)}`;
    const result = suite === 'spec' ? await runSpecSuite(deps, dataset, { limit }) : await runReviewSuite(deps, dataset, profile, { limit });
    await mkdir(RESULTS_DIR, { recursive: true });
    const resultsFile = `${RESULTS_DIR}/${suite}-${version.replace(/[/@]/g, '-')}-${Date.now()}.json`;
    await writeFile(resultsFile, JSON.stringify(result, null, 2));

    const baseline = await readBaseline();
    const regressions = findRegressions(result.summary, baseline[version]);
    console.log(JSON.stringify({ version, summary: result.summary, baseline: baseline[version] ?? null, regressions, resultsFile }, null, 2));
    if (record) {
      await writeFile(BASELINE_FILE, `${JSON.stringify({ ...baseline, [version]: result.summary }, null, 2)}\n`);
      console.log(`baseline recorded for ${version} in ${BASELINE_FILE}`);
    }
    if (regressions.length) process.exitCode = 1;
  } finally {
    await trace.shutdown();
  }
}

/** Stored runs whose pull request a human merged or closed, through the worker's own stores and SCM. */
async function buildDatasetFromRuns(repo: string): Promise<GoldenDataset | undefined> {
  const config = loadWorkerConfig();
  const store = await stores(config);
  const profile = await profileForTicket(store.profiles, `${repo}#0`);
  const { dataset, skipped } = await buildRunsDataset({ runs: store.runs, scm: scm(config, github(config, store)) }, profile);
  for (const { ticketKey, reason } of skipped) console.log(`skipped ${ticketKey}: ${reason}`);
  return dataset;
}

const [repoArg] = positional;
if (command === 'dataset' && repoArg) {
  const dataset = fromRuns ? await buildDatasetFromRuns(repoArg) : await buildDataset(repoArg);
  if (!dataset) {
    console.log('no stored run has a pull request a human has merged or closed yet; nothing written');
  } else {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(datasetFile(repoArg), `${JSON.stringify(dataset, null, 2)}\n`);
    console.log(`${dataset.items.length} items written to ${datasetFile(repoArg)}`);
  }
} else if (command === 'run' && (positional[0] === 'spec' || positional[0] === 'review') && positional[1]) {
  await run(positional[0], positional[1]);
} else {
  console.error('usage: evals.ts dataset owner/repo [--from runs] | evals.ts run spec|review owner/repo [--dataset runs] [--limit N] [--record]');
  process.exit(1);
}
