import { DomainError } from '@zenthos/domain';

export type IssueRef = { owner: string; repo: string; issueNumber: number };

const KEY = /^([\w.-]+)\/([\w.-]+)#(\d+)$/;

/** "owner/repo#123" is the ticket key for GitHub. */
export function parseIssueKey(key: string): IssueRef {
  const match = KEY.exec(key);
  if (!match) throw new DomainError('ticket_not_found', { key, reason: 'expected owner/repo#number' });
  return { owner: match[1], repo: match[2], issueNumber: Number(match[3]) };
}

export function formatIssueKey({ owner, repo, issueNumber }: IssueRef): string {
  return `${owner}/${repo}#${issueNumber}`;
}
