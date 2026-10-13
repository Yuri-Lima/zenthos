import { DomainError, parseTicket, type Ticket } from '@zenthos/domain';
import type { IssueTrackerPort } from '@zenthos/ports';
import { parseIssueKey } from './issue-key.js';

type IssueParams = { owner: string; repo: string; issue_number: number };
type Label = string | { name?: string };

/** The three calls we use, as Octokit's `octokit.rest.issues` exposes them. A fake fits in a test. */
export interface GitHubIssuesApi {
  get(params: IssueParams): Promise<{ data: { title: string; body?: string | null; html_url: string; labels: Label[] } }>;
  createComment(params: IssueParams & { body: string }): Promise<unknown>;
  listComments(params: IssueParams & { per_page: number }): Promise<{ data: { body?: string }[] }>;
}

/** IssueTracker over the GitHub REST API. Translates only; the use cases decide. */
export class GitHubIssueTracker implements IssueTrackerPort {
  constructor(private readonly issues: GitHubIssuesApi) {}

  async getTicket(key: string): Promise<Ticket> {
    const params = issueParams(key);
    const { data } = await this.issues.get(params).catch((error: { status?: number }) => {
      if (error.status === 404) throw new DomainError('ticket_not_found', { key });
      throw error;
    });
    return parseTicket({
      key,
      title: data.title,
      body: data.body ?? '',
      url: data.html_url,
      labels: data.labels.map((label) => (typeof label === 'string' ? label : (label.name ?? ''))),
    });
  }

  async postComment(key: string, body: string): Promise<void> {
    await this.issues.createComment({ ...issueParams(key), body });
  }

  /** Used by the contract run to read back what postComment wrote. */
  async listComments(key: string): Promise<string[]> {
    const { data } = await this.issues.listComments({ ...issueParams(key), per_page: 100 });
    return data.map((comment) => comment.body ?? '');
  }
}

function issueParams(key: string): IssueParams {
  const { owner, repo, issueNumber } = parseIssueKey(key);
  return { owner, repo, issue_number: issueNumber };
}
