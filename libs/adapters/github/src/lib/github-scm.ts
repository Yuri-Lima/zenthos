import type { PullRequest } from '@zenthos/domain';
import type { OpenPullRequestInput, ScmPort } from '@zenthos/ports';
import type { GitHubClients } from './clients.js';
import { parseIssueKey } from './issue-key.js';

/** Opens pull requests on GitHub. Adds the `Closes #N` line GitHub needs to link and close the issue. */
export class GitHubScm implements ScmPort {
  constructor(private readonly clients: GitHubClients) {}

  async openPullRequest({ profile, workspace, title, body, ticketKey }: OpenPullRequestInput): Promise<PullRequest> {
    const { owner, repo, issueNumber } = parseIssueKey(ticketKey);
    const { pulls } = await this.clients.for({ owner, repo });
    const { data } = await pulls.create({
      owner,
      repo,
      title,
      head: workspace.branch,
      base: profile.baseBranch,
      body: `${body}\n\nCloses #${issueNumber}`,
    });
    return { url: data.html_url, number: data.number };
  }
}
