import { Body, Controller, Get, Inject, NotFoundException, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DomainError, repoOfTicket, RUN_STATES, RunSchema, type Run, type WorkspaceActor } from '@zenthos/domain';
import { z } from 'zod';
import { CurrentWorkspace } from '../auth/session.guard.js';
import { API_PORTS, type ApiPorts } from '../ports.js';
import { jsonSchema, parseBody } from '../openapi.js';

const StartBody = z.object({ ticketKey: z.string().min(1) });
const DecisionBody = StartBody.extend({ decision: z.enum(['approved', 'rejected']) });

const ListQuery = z.object({ state: z.enum(RUN_STATES).optional(), limit: z.coerce.number().int().min(1).max(500).optional() });

/**
 * Runs, from the stored projection the worker writes on every transition (ADR 011), scoped to the workspace whose
 * repository the ticket belongs to (ADR 019). Ticket keys carry "/" and "#", so they travel as a query parameter.
 */
@ApiTags('runs')
@Controller('runs')
export class RunsController {
  constructor(@Inject(API_PORTS) private readonly ports: ApiPorts) {}

  @Get()
  @ApiOperation({ summary: 'The newest run for a ticket, or the newest runs of the workspace, newest first' })
  @ApiQuery({ name: 'ticket', required: false, example: 'owner/repo#123' })
  @ApiQuery({ name: 'state', required: false, enum: RUN_STATES })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiOkResponse({ schema: { oneOf: [jsonSchema(RunSchema), jsonSchema(z.array(RunSchema))] } })
  async list(@Query('ticket') ticketKey: string | undefined, @Query() query: Record<string, string>, @CurrentWorkspace() actor: WorkspaceActor) {
    if (ticketKey) return this.ownedRun(ticketKey, actor);
    return this.ports.runStore.list({ ...parseBody(ListQuery, query), workspaceId: actor.workspaceId });
  }

  @Post()
  @ApiOperation({ summary: 'Start a run for a ticket of one of the workspace\'s repositories (idempotent per ticket)' })
  @ApiBody({ schema: jsonSchema(StartBody) })
  @ApiOkResponse({ schema: jsonSchema(z.object({ workflowId: z.string() })) })
  async start(@Body() body: unknown, @CurrentWorkspace('operate') actor: WorkspaceActor) {
    const { ticketKey } = parseBody(StartBody, body);
    await this.ownedRepo(ticketKey, actor);
    return this.ports.runs.start(ticketKey, actor.login);
  }

  @Post('decision')
  @ApiOperation({ summary: 'Approve or reject the current spec draft' })
  @ApiBody({ schema: jsonSchema(DecisionBody) })
  @ApiOkResponse({ schema: jsonSchema(DecisionBody) })
  async decide(@Body() body: unknown, @CurrentWorkspace('operate') actor: WorkspaceActor) {
    const { ticketKey, decision } = parseBody(DecisionBody, body);
    await this.ownedRepo(ticketKey, actor);
    await this.ports.runs.decide(ticketKey, decision, actor.login);
    return { ticketKey, decision };
  }

  /** The ticket's repository must be one of the workspace's; otherwise it is unknown here. */
  private async ownedRepo(ticketKey: string, actor: WorkspaceActor): Promise<void> {
    const profile = await this.ports.profiles.get(repoOfTicket(ticketKey));
    if (!profile || profile.workspaceId !== actor.workspaceId) throw new DomainError('unknown_repository', { key: ticketKey });
  }

  private async ownedRun(ticketKey: string, actor: WorkspaceActor): Promise<Run> {
    const run = await this.ports.runStore.latest(ticketKey);
    if (!run || run.workspaceId !== actor.workspaceId) throw new NotFoundException(`no run for ${ticketKey} in this workspace`);
    return run;
  }
}
