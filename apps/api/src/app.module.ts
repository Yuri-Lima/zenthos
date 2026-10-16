import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { DomainErrorFilter } from './domain-error.filter.js';
import { API_PORTS, type ApiPorts } from './ports.js';
import type { ApiConfig } from './config.js';
import { ProvidersController } from './modules/providers.controller.js';
import { ReposController } from './modules/repos.controller.js';
import { RunsController } from './modules/runs.controller.js';
import { WebhooksController } from './modules/webhooks.controller.js';
import { WebhooksService } from './modules/webhooks.service.js';

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { ok: true };
  }
}

/** One module: the API is small, and the ports object is the only thing the controllers share. */
export function createAppModule(ports: ApiPorts, config: ApiConfig) {
  @Module({
    controllers: [HealthController, ProvidersController, ReposController, RunsController, WebhooksController],
    providers: [WebhooksService, { provide: API_PORTS, useValue: ports }, { provide: 'ApiConfig', useValue: config }, { provide: APP_FILTER, useClass: DomainErrorFilter }],
  })
  class AppModule {}
  return AppModule;
}
