import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createAppModule } from '../app.module.js';
import { loadConfig } from '../config.js';
import { inMemoryPorts } from '../ports.js';

describe('the workspace model key over HTTP', () => {
  const ports = inMemoryPorts();
  let app: INestApplication;
  let base: string;
  const call = (method: string, body?: unknown) =>
    fetch(`${base}/model-key`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

  beforeAll(async () => {
    app = await NestFactory.create(createAppModule(ports, loadConfig({})), { logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app.close();
    await ports.close();
  });

  it('starts without a key, refuses one the provider rejects, stores an accepted one and shows only its tail, then removes it', async () => {
    expect(await (await call('GET')).json()).toEqual({ configured: false });

    const rejected = await call('PUT', { apiKey: 'rejected' });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({ code: 'model_key_invalid', context: { reason: 'invalid x-api-key' } });
    expect(await (await call('GET')).json()).toEqual({ configured: false });

    const stored = await call('PUT', { apiKey: 'sk-ant-api03-example-key-1234' });
    expect(stored.status).toBe(200);
    const status = (await stored.json()) as Record<string, unknown>;
    expect(status).toMatchObject({ configured: true, provider: 'anthropic', last4: '1234' });
    expect(JSON.stringify(status)).not.toContain('example-key');
    expect(await (await call('GET')).json()).toEqual(status);

    expect((await call('DELETE')).status).toBe(204);
    expect(await (await call('GET')).json()).toEqual({ configured: false });
  });
});
