import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth/auth.controller.js';
import { Public, SessionGuard } from './auth/session.guard.js';
import { DomainErrorFilter } from './domain-error.filter.js';
import { API_PORTS, type ApiPorts } from './ports.js';
import type { ApiConfig } from './config.js';
import { GlossaryController } from './modules/glossary.controller.js';
import { MetricsController } from './modules/metrics.controller.js';
import { ProvidersController } from './modules/providers.controller.js';
import { ReposController } from './modules/repos.controller.js';
import { RunsController } from './modules/runs.controller.js';
import { WebhooksController } from './modules/webhooks.controller.js';
import { WebhooksService } from './modules/webhooks.service.js';

@Controller('health')
class HealthController {
  @Public()
  @Get()
  health() {
    return { ok: true };
  }
}

/** One module: the API is small, and the ports object is the only thing the controllers share. */
export function createAppModule(ports: ApiPorts, config: ApiConfig) {
  @Module({
    controllers: [HealthController, AuthController, ProvidersController, ReposController, RunsController, WebhooksController, MetricsController, GlossaryController],
    providers: [WebhooksService, { provide: API_PORTS, useValue: ports }, { provide: 'ApiConfig', useValue: config }, { provide: APP_FILTER, useClass: DomainErrorFilter }, { provide: APP_GUARD, useClass: SessionGuard }],
  })
  class AppModule {}
  return AppModule;
}
