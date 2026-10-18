import { Controller, Get, Inject, NotFoundException, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { compareWithTraces, computeMetrics, MetricValueSchema, TRACE_MATCH_TOLERANCE, TraceComparisonSchema } from '@zenthos/domain';
import { z } from 'zod';
import { jsonSchema } from '../openapi.js';
import { API_PORTS, type ApiPorts } from '../ports.js';

/** Runs the metrics are computed from; one page of the newest runs is the window until the store paginates by date. */
const METRICS_WINDOW = 1000;

const TraceCheck = z.object({
  ticketKey: z.string(),
  /** False when the API has no LangFuse keys; nothing was asked. */
  available: z.boolean(),
  sessionUrl: z.string().optional(),
  comparison: z.array(TraceComparisonSchema),
  tolerance: z.object({ relative: z.number(), absoluteUsd: z.number() }),
  /** What LangFuse answered when it could not be read. */
  error: z.string().optional(),
});

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

  /** The phase gate "the numbers match LangFuse" for one run, per traced agent (ADR 015). Asked on demand: one run, two LangFuse calls. */
  @Get('traces')
  @ApiOperation({ summary: "Compare one run's stored cost per agent with what LangFuse recorded for its session" })
  @ApiQuery({ name: 'ticket', required: true })
  @ApiOkResponse({ schema: jsonSchema(TraceCheck) })
  async traces(@Query('ticket') ticketKey: string): Promise<z.infer<typeof TraceCheck>> {
    const run = ticketKey ? await this.ports.runStore.latest(ticketKey) : undefined;
    if (!run) throw new NotFoundException(`no stored run for ${ticketKey}`);
    const base = { ticketKey, tolerance: { ...TRACE_MATCH_TOLERANCE } };
    const traces = this.ports.traces;
    if (!traces) return { ...base, available: false, comparison: compareWithTraces(run.usageByAgent, {}) };
    try {
      return { ...base, available: true, sessionUrl: traces.sessionUrl(ticketKey), comparison: compareWithTraces(run.usageByAgent, await traces.usageForRun(ticketKey)) };
    } catch (error) {
      return { ...base, available: true, sessionUrl: traces.sessionUrl(ticketKey), comparison: compareWithTraces(run.usageByAgent, {}), error: error instanceof Error ? error.message : String(error) };
    }
  }
}
