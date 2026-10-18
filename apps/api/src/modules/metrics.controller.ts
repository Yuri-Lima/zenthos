import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { computeMetrics, MetricValueSchema } from '@zenthos/domain';
import { z } from 'zod';
import { jsonSchema } from '../openapi.js';
import { API_PORTS, type ApiPorts } from '../ports.js';

/** Runs the metrics are computed from; one page of the newest runs is the window until the store paginates by date. */
const METRICS_WINDOW = 1000;

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(@Inject(API_PORTS) private readonly ports: ApiPorts) {}

  @Get()
  @ApiOperation({ summary: 'Every metric, with its definition beside its value; null where the runs store is not its source' })
  @ApiOkResponse({ schema: jsonSchema(z.array(MetricValueSchema)) })
  async list() {
    return computeMetrics(await this.ports.runStore.list({ limit: METRICS_WINDOW }));
  }
}
