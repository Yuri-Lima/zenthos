import { Body, Controller, Get, Inject, NotFoundException, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { API_PORTS, type ApiPorts } from '../ports.js';
import { jsonSchema, parseBody } from '../openapi.js';

const StartBody = z.object({ ticketKey: z.string().min(1) });
const DecisionBody = StartBody.extend({ decision: z.enum(['approved', 'rejected']) });

/** Runs, as the workflow sees them. Ticket keys carry "/" and "#", so they travel as a query parameter. */
@ApiTags('runs')
@Controller('runs')
export class RunsController {
  constructor(@Inject(API_PORTS) private readonly ports: ApiPorts) {}

  @Get()
  @ApiOperation({ summary: 'The run for a ticket' })
  @ApiQuery({ name: 'ticket', example: 'owner/repo#123' })
  async state(@Query('ticket') ticketKey: string) {
    const run = await this.ports.runs.state(ticketKey);
    if (!run) throw new NotFoundException(`no run for ${ticketKey}`);
    return run;
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
