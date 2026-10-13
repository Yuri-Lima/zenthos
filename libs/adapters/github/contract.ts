/**
 * Runs the IssueTracker contract against a real GitHub issue you own. GitHub has no test double, so this
 * is a script rather than a Jest suite:
 *   GITHUB_TOKEN=... pnpm nx run @zenthos/adapter-github:contract -- owner/repo#1
 * It posts one comment on that issue.
 */
import { issueTrackerContract } from '@zenthos/ports';
import { createGitHubIssueTracker } from './src/lib/octokit.js';

const key = process.argv[2];
const token = process.env['GITHUB_TOKEN'];
if (!key || !token) {
  console.error('usage: GITHUB_TOKEN=... contract.ts owner/repo#number');
  process.exit(1);
}

const port = createGitHubIssueTracker(token);
const seeded = await port.getTicket(key);
for (const [name, check] of Object.entries(issueTrackerContract)) {
  await check({
    port,
    seeded,
    readComments: async (k) => (await port.listComments(k)).filter((c) => c === 'hello from the contract'),
  });
  console.log(`ok  ${name}`);
}
