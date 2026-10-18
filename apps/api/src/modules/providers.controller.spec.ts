import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createConnection } from '@zenthos/domain';
import { createAppModule } from '../app.module.js';
import { loadConfig } from '../config.js';
import { inMemoryPorts } from '../ports.js';

describe('providers over HTTP', () => {
  const ports = inMemoryPorts();
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    app = await NestFactory.create(createAppModule(ports, loadConfig({ ZENTHOS_DASHBOARD_ORIGIN: 'http://dash.test' })), { logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app.close();
    await ports.close();
  });

  const post = (path: string, body?: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

  it('refuses a token GitHub rejects without storing it, stores one it accepts, and checks it later', async () => {
    const refused = await post('/providers/github/token', { name: 'me', token: 'rejected' });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ code: 'invalid_credentials' });
    expect(await ports.connections.list()).toEqual([]);

    const accepted = await post('/providers/github/token', { name: 'me', token: 'ghp_ok' });
    const connection = (await accepted.json()) as { id: string; kind: string; token?: string };
    expect(connection).toMatchObject({ kind: 'github-token' });
    expect(JSON.stringify(connection)).not.toContain('ghp_ok');

    const check = await post(`/providers/${connection.id}/check`);
    expect(check.status).toBe(200);
    expect(await check.json()).toMatchObject({ ok: true, actsAs: 'memory' });
  });

  it('records an installation and sends the browser back to the dashboard settings', async () => {
    const appConnection = createConnection({ provider: 'github', name: 'zenthos-memory', credentials: { type: 'github-app', appId: '7', privateKey: 'pem' }, app: { slug: 'zenthos-memory', webhookSecret: 'w' } });
    await ports.connections.save(appConnection);
    const res = await fetch(`${base}/providers/github/install/callback?connection=${appConnection.id}&installation_id=99`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`http://dash.test/settings?connected=${appConnection.id}`);
    expect((await ports.connections.get(appConnection.id))?.installations.map((i) => i.installationId)).toEqual([99]);
  });
});
