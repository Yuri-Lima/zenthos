import { DomainError, parseTicket, type Ticket } from '@zenthos/domain';
import type { IssueTrackerPort } from '@zenthos/ports';
import type { GitHubClients } from './clients.js';
import { parseIssueKey } from './issue-key.js';

/** IssueTracker over the GitHub REST API. Translates only; the use cases decide. */
export class GitHubIssueTracker implements IssueTrackerPort {
  constructor(private readonly clients: GitHubClients) {}

  async getTicket(key: string): Promise<Ticket> {
    const { owner, repo, issueNumber } = parseIssueKey(key);
    const { issues } = await this.clients.for({ owner, repo });
    const { data } = await issues.get({ owner, repo, issue_number: issueNumber }).catch((error: { status?: number }) => {
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
    const { owner, repo, issueNumber } = parseIssueKey(key);
    const { issues } = await this.clients.for({ owner, repo });
    await issues.createComment({ owner, repo, issue_number: issueNumber, body });
  }

  /** Used by the contract run to read back what postComment wrote. */
  async listComments(key: string): Promise<string[]> {
    const { owner, repo, issueNumber } = parseIssueKey(key);
    const { issues } = await this.clients.for({ owner, repo });
    const { data } = await issues.listComments({ owner, repo, issue_number: issueNumber, per_page: 100 });
    return data.map((comment) => comment.body ?? '');
  }
}
