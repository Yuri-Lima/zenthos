/**
 * Live check of the GitHub connection against a repository you own. GitHub has no test double, so this is
 * a script, not a Jest suite. It runs the issue-tracker contract (one comment on the issue), then pushes
 * one marker commit to a throwaway `zenthos/contract-<time>` branch, asks GitHub who it attributes that
 * commit to, and deletes the branch.
 *
 *   pnpm nx run @zenthos/worker:contract -- owner/repo#123      (credentials from .env, see docs/authentication.md)
 */
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GitSandbox } from '@zenthos/adapter-git-sandbox';
import { GitHubIssueTracker, parseRepo } from '@zenthos/adapter-github';
import { createGitHubClients } from '@zenthos/adapter-github/live';
import { profileForTicket } from '@zenthos/application';
import { issueTrackerContract } from '@zenthos/ports';
import { githubCredentials } from '../config.js';
import { loadWorkerConfig, repoProfiles } from '../composition.js';

/** Outside the sandbox allowlist on purpose: only this check deletes branches, never the pipeline. */
const deleteBranch = (cwd: string, name: string) =>
  new Promise<void>((resolve) => execFile('git', ['push', '--quiet', 'origin', '--delete', name], { cwd }, () => resolve()));

const key = process.argv[2];
const config = loadWorkerConfig();
const credentials = key ? githubCredentials(config) : undefined;
if (!key || !credentials) {
  console.error('usage: contract.ts owner/repo#number  (needs GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY[_FILE], or GITHUB_TOKEN)');
  process.exit(1);
}

const clients = createGitHubClients(credentials);
const tracker = new GitHubIssueTracker(clients);
const seeded = await tracker.getTicket(key);
for (const [name, check] of Object.entries(issueTrackerContract)) {
  await check({
    port: tracker,
    seeded,
    readComments: (k) => tracker.listComments(k),
  });
  console.log(`ok  ${name}`);
}

const profiles = await repoProfiles(config);
const profile = await profileForTicket(profiles, key);
const ref = parseRepo(profile.repo);
const repo = await clients.for(ref);
const identity = await repo.gitIdentity();
const root = path.join(tmpdir(), 'zenthos-contract');
await mkdir(root, { recursive: true });
const sandbox = new GitSandbox({ root, profiles, credential: () => repo.gitToken(), author: async () => identity });
const branch = `zenthos/contract-${Date.now()}`;
const workspace = await sandbox.prepare(profile, branch);
try {
  await writeFile(path.join(workspace.path, '.zenthos-contract'), `${new Date().toISOString()}\n`);
  await sandbox.commitAndPush(workspace, 'ZenthOs contract check (delete me)');
  const { data } = await repo.commits.getCommit({ ...ref, ref: branch });
  const shown = data.author?.login ?? '(unlinked)';
  if (shown !== identity.name) {
    throw new Error(`GitHub attributes the commit to ${shown}, expected ${identity.name} (git author ${data.commit.author?.name} <${data.commit.author?.email}>)`);
  }
  console.log(`ok  commits are attributed to ${shown}`);
} finally {
  await deleteBranch(workspace.path, branch);
  await sandbox.cleanup(workspace);
}
console.log(`cleaned up branch ${branch}`);
