import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createAppModule } from './app.module.js';
import { composePorts, loadApiConfig } from './composition.js';

const config = loadApiConfig();
const ports = await composePorts(config);
// rawBody keeps the bytes GitHub signed; the webhook verifies against them, not against re-serialised JSON.
const app = await NestFactory.create(createAppModule(ports, config), { rawBody: true });
SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('ZenthOs API').setVersion('0.1').build()));
app.enableShutdownHooks();
await app.listen(config.PORT);
console.log(`zenthos api: http://localhost:${config.PORT} (OpenAPI at /docs) stores=${config.DATABASE_URL ? 'postgres' : 'memory'} runs=${config.RUN_CONTROL} githubApps=${config.GITHUB_APPS}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    await ports.close();
  });
}
