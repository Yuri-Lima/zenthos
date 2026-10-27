import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { InMemoryGitHubApps } from '@zenthos/adapter-in-memory';
import { connectGitHubApp } from '@zenthos/application';
import { DRY_RUN_WORKSPACE } from '@zenthos/domain';
import { createAppModule } from '../app.module.js';
import { loadConfig } from '../config.js';
import { inMemoryPorts } from '../ports.js';

describe('installations of the platform app over HTTP', () => {
  const ports = { ...inMemoryPorts(), githubApps: new InMemoryGitHubApps(undefined, [{ installationId: 77, account: 'owner', repositories: ['owner/app'] }]) };
  let app: INestApplication;
  let base: string;
  const get = (path: string) => fetch(`${base}${path}`, { redirect: 'manual' });

  beforeAll(async () => {
    app = await NestFactory.create(createAppModule(ports, loadConfig({ ZENTHOS_DASHBOARD_ORIGIN: 'http://dash.test' })), { logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app.close();
    await ports.close();
  });

  it('refuses to install before the platform app exists', async () => {
    expect((await get('/github/install')).status).toBe(409);
    expect(await (await get('/github/installations')).json()).toEqual([]);
  });

  it('installs through GitHub with a state, claims the installation for the workspace, serves its repositories, and releases it', async () => {
    await connectGitHubApp(ports, { appId: '42', slug: 'zenthos-test', privateKey: 'pem', webhookSecret: 'whs', clientId: 'c', clientSecret: 'cs' });

    const install = await get('/github/install');
    expect(install.status).toBe(302);
    const location = install.headers.get('location') ?? '';
    expect(location).toMatch(/^https:\/\/github\.com\/apps\/zenthos-test\/installations\/new\?state=[a-f0-9]+$/);
    const state = new URL(location).searchParams.get('state');

    expect((await get(`/github/install/callback?installation_id=77&state=stale`)).status).toBe(404);
    const callback = await get(`/github/install/callback?installation_id=77&state=${state}`);
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('http://dash.test/settings?installed=77');

    expect(await (await get('/github/installations')).json()).toEqual([{ installationId: 77, account: 'owner', repositories: ['owner/app'], workspaceId: DRY_RUN_WORKSPACE.id }]);
    expect(await (await get('/github/repositories/owner/app')).json()).toEqual({ defaultBranch: 'main', cloneUrl: 'https://github.com/owner/app.git' });
    expect((await get('/github/repositories/owner/other')).status).toBe(404);

    expect((await fetch(`${base}/github/installations/77`, { method: 'DELETE' })).status).toBe(204);
    expect(await (await get('/github/installations')).json()).toEqual([]);
    expect((await fetch(`${base}/github/installations/77`, { method: 'DELETE' })).status).toBe(404);
  });
});
