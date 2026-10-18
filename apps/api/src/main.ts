import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { createAppModule } from './app.module.js';
import { composePorts, loadApiConfig } from './composition.js';
import { openApiDocument } from './openapi.js';

const config = loadApiConfig();
const ports = await composePorts(config);
// rawBody keeps the bytes GitHub signed; the webhook verifies against them, not against re-serialised JSON.
const app = await NestFactory.create(createAppModule(ports, config), { rawBody: true });
app.enableCors({ origin: config.ZENTHOS_DASHBOARD_ORIGIN, credentials: true });
SwaggerModule.setup('docs', app, () => openApiDocument(app));
app.enableShutdownHooks();
await app.listen(config.PORT);
console.log(`zenthos api: http://localhost:${config.PORT} (OpenAPI at /docs) stores=${config.DATABASE_URL ? 'postgres' : 'memory'} runs=${config.RUN_CONTROL} githubApps=${config.GITHUB_APPS} auth=${config.ZENTHOS_AUTH}${config.ZENTHOS_AUTH === 'off' ? ' (every request is anonymous; set ZENTHOS_AUTH=github before exposing this)' : ` allowlist=${config.ZENTHOS_ALLOWED_LOGINS.join(',')}`}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    await ports.close();
  });
}
