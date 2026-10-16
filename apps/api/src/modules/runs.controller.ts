import { Body, Controller, Get, Inject, NotFoundException, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RUN_STATES } from '@zenthos/domain';
import { z } from 'zod';
import { API_PORTS, type ApiPorts } from '../ports.js';
import { jsonSchema, parseBody } from '../openapi.js';

const StartBody = z.object({ ticketKey: z.string().min(1) });
const DecisionBody = StartBody.extend({ decision: z.enum(['approved', 'rejected']) });

const ListQuery = z.object({ state: z.enum(RUN_STATES).optional(), limit: z.coerce.number().int().min(1).max(500).optional() });

/** Runs, from the stored projection the worker writes on every transition (ADR 011). Ticket keys carry "/" and "#", so they travel as a query parameter. */
@ApiTags('runs')
@Controller('runs')
export class RunsController {
  constructor(@Inject(API_PORTS) private readonly ports: ApiPorts) {}

  @Get()
  @ApiOperation({ summary: 'The newest run for a ticket, or the newest runs overall, newest first' })
  @ApiQuery({ name: 'ticket', required: false, example: 'owner/repo#123' })
  @ApiQuery({ name: 'state', required: false, enum: RUN_STATES })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  async list(@Query('ticket') ticketKey: string | undefined, @Query() query: Record<string, string>) {
    if (ticketKey) {
      const run = await this.ports.runStore.latest(ticketKey);
      if (!run) throw new NotFoundException(`no run for ${ticketKey}`);
      return run;
    }
    return this.ports.runStore.list(parseBody(ListQuery, query));
  }

  @Post()
  @ApiOperation({ summary: 'Start a run for a ticket (idempotent per ticket)' })
  @ApiBody({ schema: jsonSchema(StartBody) })
  start(@Body() body: unknown) {
    return this.ports.runs.start(parseBody(StartBody, body).ticketKey);
  }

  @Post('decision')
  @ApiOperation({ summary: 'Approve or reject the current spec draft' })
  @ApiBody({ schema: jsonSchema(DecisionBody) })
  async decide(@Body() body: unknown) {
    const { ticketKey, decision } = parseBody(DecisionBody, body);
    await this.ports.runs.decide(ticketKey, decision);
    return { ticketKey, decision };
  }
}
