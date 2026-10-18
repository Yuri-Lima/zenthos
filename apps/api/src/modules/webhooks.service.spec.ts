import 'reflect-metadata';
import { signPayload as sign } from '@zenthos/adapter-github';
import { InMemoryRepoProfiles } from '@zenthos/adapter-in-memory';
import { connectGitHubApp } from '@zenthos/application';
import { repoProfile } from '@zenthos/domain';
import { inMemoryPorts } from '../ports.js';
import { WebhooksService } from './webhooks.service.js';

describe('WebhooksService', () => {
  const ports = { ...inMemoryPorts(), profiles: new InMemoryRepoProfiles([repoProfile({ repo: 'owner/repo', cloneUrl: 'x', baseBranch: 'main', allowedCommands: [], gateCommands: [] })]) };
  const service = new WebhooksService(ports);
  const body = JSON.stringify({ action: 'labeled', label: { name: 'zenthos:run' }, issue: { number: 7 }, repository: { full_name: 'owner/repo' } });

  beforeAll(() => connectGitHubApp(ports, { appId: '42', slug: 'zenthos-test', privateKey: 'pem', webhookSecret: 'whs', clientId: 'c', clientSecret: 'cs' }));

  it('accepts a delivery signed with the connection secret and applies it', async () => {
    const signature = sign('whs', body);
    await expect(service.handleGitHub({ event: 'issues', deliveryId: 'd1', signature, appId: '42', rawBody: body })).resolves.toEqual({ deliveryId: 'd1', result: 'started ticket:owner/repo#7' });
  });

  it('rejects a wrong signature and an unknown app', async () => {
    await expect(service.handleGitHub({ event: 'issues', deliveryId: 'd2', signature: sign('other', body), appId: '42', rawBody: body })).rejects.toThrow(/signature/);
    await expect(service.handleGitHub({ event: 'issues', deliveryId: 'd3', signature: sign('whs', body), appId: '99', rawBody: body })).rejects.toThrow(/no GitHub App connection/);
  });
});
