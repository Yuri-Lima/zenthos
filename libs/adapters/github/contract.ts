/**
 * Runs the IssueTracker contract against a real GitHub issue you own. GitHub has no test double, so this
 * is a script rather than a Jest suite:
 *   GITHUB_APP_ID=... GITHUB_APP_PRIVATE_KEY_FILE=... pnpm nx run @zenthos/adapter-github:contract -- owner/repo#1
 *   GITHUB_TOKEN=... pnpm nx run @zenthos/adapter-github:contract -- owner/repo#1
 * It posts one comment on that issue.
 */
import { readFileSync } from 'node:fs';
import type { GitHubCredentials } from '@zenthos/domain';
import { issueTrackerContract } from '@zenthos/ports';
import { GitHubIssueTracker } from './src/lib/github-issue-tracker.js';
import { createGitHubClients } from './src/lib/octokit.js';

const key = process.argv[2];
const env = process.env;
const credentials: GitHubCredentials | undefined =
  env['GITHUB_APP_ID'] && (env['GITHUB_APP_PRIVATE_KEY'] || env['GITHUB_APP_PRIVATE_KEY_FILE'])
    ? { type: 'github-app', appId: env['GITHUB_APP_ID'], privateKey: env['GITHUB_APP_PRIVATE_KEY'] ?? readFileSync(env['GITHUB_APP_PRIVATE_KEY_FILE'] as string, 'utf8') }
    : env['GITHUB_TOKEN']
      ? { type: 'github-token', token: env['GITHUB_TOKEN'] }
      : undefined;
if (!key || !credentials) {
  console.error('usage: (GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY[_FILE] | GITHUB_TOKEN) contract.ts owner/repo#number');
  process.exit(1);
}

const port = new GitHubIssueTracker(createGitHubClients(credentials));
const seeded = await port.getTicket(key);
for (const [name, check] of Object.entries(issueTrackerContract)) {
  await check({
    port,
    seeded,
    readComments: async (k) => (await port.listComments(k)).filter((c) => c === 'hello from the contract'),
  });
  console.log(`ok  ${name}`);
}
