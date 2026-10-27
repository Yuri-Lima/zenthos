import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { createAppModule } from './app.module.js';
import { loadConfig } from './config.js';
import { openApiDocument } from './openapi.js';
import { inMemoryPorts } from './ports.js';

describe('OpenAPI document', () => {
  it('documents every endpoint with its response shape, and the committed file matches the code', async () => {
    const config = loadConfig({});
    const ports = inMemoryPorts();
    const app = await NestFactory.create(createAppModule(ports, config), { logger: false });
    await app.init();
    try {
      const document = openApiDocument(app);
      for (const path of ['/runs', '/repos/{owner}/{name}', '/platform', '/github/installations', '/workspaces', '/metrics', '/glossary', '/webhooks/github']) expect(document.paths[path]).toBeDefined();
      expect(document.paths['/metrics'].get?.responses['200']).toBeDefined();
      expect(document.paths['/runs'].get?.responses['200']).toBeDefined();
      const committed = JSON.parse(readFileSync('openapi.json', 'utf8'));
      expect(committed).toEqual(JSON.parse(JSON.stringify(document)));
    } finally {
      await app.close();
      await ports.close();
    }
  });
});
