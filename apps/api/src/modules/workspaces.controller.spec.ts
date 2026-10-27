import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { connectGitHubApp } from '@zenthos/application';
import { createRun, repoProfile } from '@zenthos/domain';
import { createAppModule } from '../app.module.js';
import { loadConfig } from '../config.js';
import { inMemoryPorts } from '../ports.js';

/** Signs `login` in through the in-memory GitHub (a code of `user:<login>` is that user) and returns their cookie. */
async function signIn(base: string, login: string): Promise<string> {
  const start = await fetch(`${base}/auth/github?returnTo=/`, { redirect: 'manual' });
  const state = new URL(start.headers.get('location') ?? '').searchParams.get('state');
  const callback = await fetch(`${base}/auth/github/callback?code=user:${login}&state=${state}`, { redirect: 'manual' });
  expect(callback.status).toBe(302);
  return (callback.headers.get('set-cookie') ?? '').split(';')[0];
}

describe('workspaces over HTTP, with sign-in on', () => {
  const ports = inMemoryPorts();
  let app: INestApplication;
  let base: string;
  const json = (cookie: string, method: string, path: string, body?: unknown) =>
    fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

  beforeAll(async () => {
    await connectGitHubApp(ports, { appId: '42', slug: 'zenthos-test', privateKey: 'pem', webhookSecret: 'whs', clientId: 'c', clientSecret: 'cs' });
    app = await NestFactory.create(createAppModule(ports, loadConfig({ ZENTHOS_AUTH: 'github', ZENTHOS_DASHBOARD_ORIGIN: 'http://dash.test' })), { logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app.close();
    await ports.close();
  });

  it('anyone signs in; without a workspace the scoped routes refuse; creating one makes them its owner', async () => {
    const yuri = await signIn(base, 'yuri');
    expect(await (await json(yuri, 'GET', '/auth/me')).json()).toMatchObject({ login: 'yuri' });
    expect((await json(yuri, 'GET', '/repos')).status).toBe(409);
    expect(await (await json(yuri, 'GET', '/workspaces')).json()).toEqual([]);

    const created = (await (await json(yuri, 'POST', '/workspaces', { name: 'Acme' })).json()) as { id: string };
    expect(created).toMatchObject({ name: 'Acme' });
    expect(await (await json(yuri, 'GET', '/auth/me')).json()).toMatchObject({ login: 'yuri', workspace: { id: created.id, name: 'Acme', role: 'owner' } });
    expect(await (await json(yuri, 'GET', '/workspaces')).json()).toEqual([expect.objectContaining({ id: created.id, role: 'owner', current: true })]);
    expect(await (await json(yuri, 'GET', '/repos')).json()).toEqual([]);
  });

  it('owners invite by login; the invited person lands in the workspace at sign-in; members see runs but may not configure', async () => {
    const yuri = await signIn(base, 'yuri');
    const [{ id }] = (await (await json(yuri, 'GET', '/workspaces')).json()) as { id: string }[];
    const invited = await json(yuri, 'PUT', `/workspaces/${id}/members/Ana`, { role: 'member' });
    expect(await invited.json()).toMatchObject({ login: 'Ana', role: 'member', invitedBy: 'yuri' });

    const profile = repoProfile({ repo: 'acme/app', cloneUrl: 'https://github.com/acme/app.git', baseBranch: 'main', allowedCommands: [], gateCommands: [], workspaceId: id });
    await ports.profiles.save(profile);
    await ports.runStore.save(createRun({ key: 'acme/app#1', title: 't', body: '', url: 'https://example.test', labels: [] }, { workspaceId: id }));

    const ana = await signIn(base, 'ana');
    expect(await (await json(ana, 'GET', '/auth/me')).json()).toMatchObject({ workspace: { id, role: 'member' } });
    expect(((await (await json(ana, 'GET', '/runs')).json()) as { ticket: { key: string } }[]).map((r) => r.ticket.key)).toEqual(['acme/app#1']);
    expect((await json(ana, 'GET', '/repos/acme/app')).status).toBe(200);
    expect((await json(ana, 'PUT', '/repos/acme/app', { cloneUrl: 'https://github.com/acme/app.git', baseBranch: 'main', allowedCommands: [], gateCommands: [] })).status).toBe(403);
    expect((await json(ana, 'PUT', '/model-key', { apiKey: 'sk-ant-api03-not-hers' })).status).toBe(403);
    expect((await json(ana, 'PUT', `/workspaces/${id}/members/Bob`, { role: 'member' })).status).toBe(403);
    expect((await json(yuri, 'DELETE', `/workspaces/${id}/members/yuri`)).status).toBe(409);
  });

  it('another workspace sees none of it, and a repository cannot be taken over from there', async () => {
    const bob = await signIn(base, 'bob');
    await json(bob, 'POST', '/workspaces', { name: 'Other' });
    expect(await (await json(bob, 'GET', '/runs')).json()).toEqual([]);
    expect((await json(bob, 'GET', '/repos/acme/app')).status).toBe(404);
    expect((await json(bob, 'GET', '/runs?ticket=acme/app%231')).status).toBe(404);
    expect((await json(bob, 'PUT', '/repos/acme/app', { cloneUrl: 'https://github.com/acme/app.git', baseBranch: 'main', allowedCommands: [], gateCommands: [] })).status).toBe(403);
    const [{ id: other }] = (await (await json(bob, 'GET', '/workspaces')).json()) as { id: string }[];
    const yuri = await signIn(base, 'yuri');
    expect((await json(yuri, 'POST', `/workspaces/${other}/select`)).status).toBe(403);
    expect((await json(yuri, 'GET', `/workspaces/${other}/members`)).status).toBe(403);
  });
});
