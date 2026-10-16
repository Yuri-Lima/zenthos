import type { GitHubCredentials } from '@zenthos/domain';
import { ResolvingGitHubClients, type GitHubClients, type GitHubRepoClients } from './clients.js';

describe('ResolvingGitHubClients', () => {
  it('creates one underlying client per distinct credentials and routes each repository through it', async () => {
    const created: GitHubCredentials[] = [];
    const create = (credentials: GitHubCredentials): GitHubClients => {
      created.push(credentials);
      return { for: async (ref) => ({ gitToken: async () => `${credentials.type}:${ref.owner}/${ref.repo}` }) as unknown as GitHubRepoClients };
    };
    const app = { type: 'github-app', appId: '1', privateKey: 'pem' } as const;
    const token = { type: 'github-token', token: 't' } as const;
    const clients = new ResolvingGitHubClients(async (ref) => (ref.owner === 'acme' ? app : token), create);
    expect(await (await clients.for({ owner: 'acme', repo: 'a' })).gitToken()).toBe('github-app:acme/a');
    expect(await (await clients.for({ owner: 'acme', repo: 'b' })).gitToken()).toBe('github-app:acme/b');
    expect(await (await clients.for({ owner: 'me', repo: 'c' })).gitToken()).toBe('github-token:me/c');
    expect(created).toEqual([app, token]);
  });
});
