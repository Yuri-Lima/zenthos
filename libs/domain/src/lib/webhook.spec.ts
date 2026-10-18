import { commandFromGitHubEvent } from './webhook.js';

const labeled = (name: string) => ({ action: 'labeled', label: { name }, issue: { number: 300 }, repository: { full_name: 'owner/repo' }, sender: { login: 'naira' } });

describe('commandFromGitHubEvent', () => {
  it('turns the pipeline labels into start and decision commands and ignores the rest', () => {
    expect(commandFromGitHubEvent('issues', labeled('zenthos:run'))).toEqual({ kind: 'start', ticketKey: 'owner/repo#300', actor: 'naira' });
    expect(commandFromGitHubEvent('issues', labeled('zenthos:spec-approved'))).toEqual({ kind: 'decision', ticketKey: 'owner/repo#300', decision: 'approved', actor: 'naira' });
    expect(commandFromGitHubEvent('issues', labeled('zenthos:spec-rejected'))).toMatchObject({ decision: 'rejected' });
    expect(commandFromGitHubEvent('issues', labeled('bug'))).toMatchObject({ kind: 'ignore' });
    expect(commandFromGitHubEvent('issues', { action: 'opened' })).toMatchObject({ kind: 'ignore' });
    expect(commandFromGitHubEvent('push', {})).toMatchObject({ kind: 'ignore' });
  });

  it('maps installation events to the connection changes', () => {
    const installation = { id: 9, account: { login: 'owner' } };
    expect(commandFromGitHubEvent('installation', { action: 'created', installation, repositories: [{ full_name: 'owner/a' }] })).toEqual({
      kind: 'installation',
      action: 'added',
      installation: { installationId: 9, account: 'owner', repositories: ['owner/a'] },
    });
    expect(commandFromGitHubEvent('installation', { action: 'deleted', installation })).toMatchObject({ action: 'removed' });
    expect(commandFromGitHubEvent('installation_repositories', { action: 'removed', installation, repositories_added: [{ full_name: 'owner/b' }], repositories_removed: [{ full_name: 'owner/a' }] })).toEqual({
      kind: 'repositories',
      installationId: 9,
      account: 'owner',
      added: ['owner/b'],
      removed: ['owner/a'],
    });
    expect(commandFromGitHubEvent('installation', { action: 'suspend', installation })).toMatchObject({ kind: 'ignore' });
  });
});
