import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createAppModule } from '../app.module.js';
import { loadConfig } from '../config.js';
import { inMemoryPorts } from '../ports.js';

const TOKEN = 'setup-token-for-tests';
const config = () => loadConfig({ ZENTHOS_SETUP_TOKEN: TOKEN, ZENTHOS_DASHBOARD_ORIGIN: 'http://dash.test', ZENTHOS_API_BASE_URL: 'http://api.test' });

describe('platform setup over HTTP', () => {
  const ports = inMemoryPorts();
  let app: INestApplication;
  let base: string;
  const form = (path: string, fields: Record<string, string>) =>
    fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });

  beforeAll(async () => {
    app = await NestFactory.create(createAppModule(ports, config()), { logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app.close();
    await ports.close();
  });

  it('reports no app, refuses a wrong token, serves the manifest page for the right one, and makes the created app the platform app', async () => {
    expect(await (await fetch(`${base}/platform`)).json()).toEqual({ configured: false });

    const refused = await form('/platform/github/manifest', { token: 'wrong', name: 'zenthos' });
    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({ code: 'setup_token_invalid' });

    const page = await form('/platform/github/manifest', { token: TOKEN, name: 'zenthos' });
    expect(page.status).toBe(201);
    const html = await page.text();
    expect(html).toContain('"public":true');
    expect(html).toContain('http://api.test/github/install/callback');
    const state = html.match(/settings\/apps\/new\?state=([a-f0-9]+)/)?.[1];
    expect(state).toBeDefined();

    const callback = await fetch(`${base}/platform/github/manifest/callback?code=abc&state=${state}`, { redirect: 'manual' });
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('http://dash.test/');
    expect(await (await fetch(`${base}/platform`)).json()).toEqual({ configured: true, slug: 'zenthos-memory', installUrl: 'https://github.com/apps/zenthos-memory/installations/new' });
    expect((await ports.connections.platformApp())?.workspaceId).toBeUndefined();

    const again = await form('/platform/github/manifest', { token: TOKEN, name: 'zenthos' });
    expect(again.status).toBe(409);
    expect((await fetch(`${base}/platform/github/manifest/callback?code=abc&state=${state}`)).status).toBe(404);
  });
});

describe('platform app created by hand', () => {
  it('becomes the platform app with the setup token, and its key is checked first', async () => {
    const ports = inMemoryPorts();
    const app = await NestFactory.create(createAppModule(ports, config()), { logger: false });
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const post = (body: unknown) => fetch(`${base}/platform/github/app`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    try {
      expect((await post({ token: TOKEN, name: 'zenthos-hand', appId: '5', privateKey: 'rejected', webhookSecret: 'whs' })).status).toBe(400);
      const created = await post({ token: TOKEN, name: 'zenthos-hand', appId: '5', privateKey: 'pem', webhookSecret: 'whs', clientId: 'Iv1.x', clientSecret: 'cs' });
      expect(created.status).toBe(201);
      expect(await created.json()).toEqual({ configured: true, slug: 'zenthos-hand', installUrl: 'https://github.com/apps/zenthos-hand/installations/new' });
      expect((await post({ token: TOKEN, name: 'other', appId: '6', privateKey: 'pem' })).status).toBe(409);
    } finally {
      await app.close();
      await ports.close();
    }
  });
});
