import { DomainError } from '@zenthos/domain';
import { issueTrackerContract } from '@zenthos/ports';
import type { GitHubClients, GitHubIssuesApi, GitHubPullsApi } from './clients.js';
import { parseRepo } from './clients.js';
import { GitHubIssueTracker } from './github-issue-tracker.js';
import { formatIssueKey, parseIssueKey } from './issue-key.js';

describe('issue keys', () => {
  it('round-trips owner/repo#number', () => {
    const ref = parseIssueKey('nairaromero/legal-connect#42');
    expect(ref).toEqual({ owner: 'nairaromero', repo: 'legal-connect', issueNumber: 42 });
    expect(formatIssueKey(ref)).toBe('nairaromero/legal-connect#42');
    expect(parseRepo('nairaromero/legal-connect')).toEqual({ owner: 'nairaromero', repo: 'legal-connect' });
  });

  it('rejects anything else with ticket_not_found', () => {
    expect(() => parseIssueKey('PHX-42')).toThrow(DomainError);
  });
});

/** Behaves like the REST API for one issue: labels come back as strings or objects, unknown numbers 404. */
export function fakeClients(): GitHubClients & { comments: string[]; resolved: string[] } {
  const comments: string[] = [];
  const resolved: string[] = [];
  const issues: GitHubIssuesApi = {
    get: async ({ issue_number }) => {
      if (issue_number !== 1) throw Object.assign(new Error('Not Found'), { status: 404 });
      return {
        data: {
          title: 'Add CSV export',
          body: null,
          html_url: 'https://github.com/owner/repo/issues/1',
          labels: ['bug', { name: 'zenthos:spec-approved' }],
        },
      };
    },
    createComment: async ({ body }) => {
      comments.push(body);
    },
    listComments: async () => ({ data: comments.map((body) => ({ body })) }),
  };
  const pulls: GitHubPullsApi = {
    create: async () => ({ data: { html_url: 'https://github.com/owner/repo/pull/7', number: 7 } }),
  };
  return {
    comments,
    resolved,
    for: async ({ owner, repo }) => {
      resolved.push(`${owner}/${repo}`);
      return { issues, pulls, gitToken: async () => 'ghs_fake', gitIdentity: async () => ({ name: 'zenthos-test[bot]', email: '1+zenthos-test[bot]@users.noreply.github.com' }) };
    },
  };
}

describe('GitHubIssueTracker', () => {
  it('maps an issue to a Ticket, with labels flattened and a null body as empty', async () => {
    const clients = fakeClients();
    const ticket = await new GitHubIssueTracker(clients).getTicket('owner/repo#1');
    expect(ticket).toEqual({
      key: 'owner/repo#1',
      title: 'Add CSV export',
      body: '',
      url: 'https://github.com/owner/repo/issues/1',
      labels: ['bug', 'zenthos:spec-approved'],
    });
    expect(clients.resolved).toEqual(['owner/repo']);
  });

  for (const [name, check] of Object.entries(issueTrackerContract)) {
    it(name, async () => {
      const port = new GitHubIssueTracker(fakeClients());
      const seeded = await port.getTicket('owner/repo#1');
      await check({ port, seeded, readComments: (key) => port.listComments(key) });
    });
  }
});
