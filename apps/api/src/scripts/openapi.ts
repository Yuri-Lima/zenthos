/**
 * Writes apps/api/openapi.json from the controllers, with in-memory ports and no listener. The generated
 * client in libs/api-client is built from that file (ADR 003); CI regenerates both and fails on a diff.
 *
 *   pnpm nx run @zenthos/api:openapi
 */
import 'reflect-metadata';
import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { createAppModule } from '../app.module.js';
import { loadConfig } from '../config.js';
import { openApiDocument } from '../openapi.js';
import { inMemoryPorts } from '../ports.js';

const config = loadConfig({});
const ports = inMemoryPorts();
const app = await NestFactory.create(createAppModule(ports, config), { logger: false });
await app.init();
await writeFile('apps/api/openapi.json', `${JSON.stringify(openApiDocument(app), null, 2)}\n`);
await app.close();
await ports.close();
console.log('apps/api/openapi.json written');
