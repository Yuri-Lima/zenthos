import { parseUnifiedDiff, type Diff, type PullRequest, type RepoProfile } from '@zenthos/domain';
import type { OpenPullRequestInput, PostReviewInput, ScmPort } from '@zenthos/ports';
import { parseRepo, type GitHubClients } from './clients.js';
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

  async findPullRequest(profile: RepoProfile, branch: string): Promise<PullRequest | undefined> {
    const ref = parseRepo(profile.repo);
    const { pulls } = await this.clients.for(ref);
    const { data } = await pulls.list({ ...ref, head: `${ref.owner}:${branch}`, state: 'open' });
    return data[0] ? { url: data[0].html_url, number: data[0].number } : undefined;
  }

  async readPullRequestDiff(profile: RepoProfile, pullRequest: PullRequest): Promise<Diff> {
    const ref = parseRepo(profile.repo);
    const { pulls } = await this.clients.for(ref);
    const { data } = await pulls.get({ ...ref, pull_number: pullRequest.number, mediaType: { format: 'diff' } });
    return parseUnifiedDiff(String(data));
  }

  /** Always a comment: a bot must not approve or block its own pull request; the gate result is in the body. */
  async postReview({ profile, pullRequest, body }: PostReviewInput): Promise<void> {
    const ref = parseRepo(profile.repo);
    const { pulls } = await this.clients.for(ref);
    await pulls.createReview({ ...ref, pull_number: pullRequest.number, body, event: 'COMMENT' });
  }
}
