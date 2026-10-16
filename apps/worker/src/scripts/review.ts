/**
 * Reviews an open pull request the pipeline made, outside a workflow: the same use case, adapters
 * and rubric the worker uses, posted on the pull request. Useful to re-review after a human pushed
 * to the branch, and to try a prompt change on a real diff before the evals judge it.
 *
 *   pnpm nx run @zenthos/worker:review -- owner/repo#123 path/to/spec.json
 *
 * The spec is the one the run drafted (runs are persisted by the API in phase 3; until then pass the
 * JSON). Needs REVIEWER=anthropic, SCM=github and the GitHub credentials, see docs/authentication.md.
 */
import { readFile } from 'node:fs/promises';
import { intakeTicket, profileForTicket, reviewChange } from '@zenthos/application';
import { branchNameFor, parseSpec } from '@zenthos/domain';
import { github, issueTracker, loadWorkerConfig, repoProfiles, reviewer, scm, tracing } from '../composition.js';

const [key, specPath] = process.argv.slice(2);
if (!key || !specPath) {
  console.error('usage: review.ts owner/repo#number spec.json');
  process.exit(1);
}

const config = loadWorkerConfig();
const trace = tracing(config);
const clients = github(config);
const profile = await profileForTicket(await repoProfiles(config), key);
const deps = { issueTracker: issueTracker(config, clients), scm: scm(config, clients), reviewer: await reviewer(config, trace) };
try {
  const pullRequest = await deps.scm.findPullRequest(profile, branchNameFor(key));
  if (!pullRequest) throw new Error(`no open pull request for ${branchNameFor(key)} in ${profile.repo}`);
  const run = { ...(await intakeTicket(deps, key, profile)), spec: parseSpec(JSON.parse(await readFile(specPath, 'utf8'))), pullRequest };
  const { review, gate } = await reviewChange(deps, run, profile);
  console.log(JSON.stringify({ pullRequest, gate, scores: review.scores, findings: review.findings, summary: review.summary }, null, 2));
} finally {
  await trace.shutdown();
}
