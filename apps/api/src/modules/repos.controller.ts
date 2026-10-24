import { Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Put } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DomainError, repoProfile, RepoProfileSchema, type RepoProfile, type WorkspaceActor } from '@zenthos/domain';
import { z } from 'zod';
import { CurrentWorkspace } from '../auth/session.guard.js';
import { API_PORTS, type ApiPorts } from '../ports.js';
import { jsonSchema, parseBody } from '../openapi.js';

const PolicyBody = z.object({ costCeilingUsd: z.number().positive(), diffBudgetLines: z.number().int().positive(), forbiddenPathPrefixes: z.array(z.string()), maxImplementRounds: z.number().int().min(1), reviewThreshold: z.number().min(1).max(5), maxReviewRounds: z.number().int().min(0) }).partial();
const ProfileBody = z.object({
  cloneUrl: z.string().url(),
  baseBranch: z.string().min(1),
  allowedCommands: z.array(z.string().min(1)),
  gateCommands: z.array(z.string().min(1)),
  policy: PolicyBody.optional(),
  connectionId: z.string().uuid().optional(),
});

/** Repository profiles (ADR 006): what the pipeline may do in each repository, edited here, read by the worker. A repository belongs to one workspace (ADR 019). */
@ApiTags('repos')
@Controller('repos')
export class ReposController {
  constructor(@Inject(API_PORTS) private readonly ports: ApiPorts) {}

  @Get()
  @ApiOperation({ summary: "List the workspace's repository profiles" })
  @ApiOkResponse({ schema: jsonSchema(z.array(RepoProfileSchema)) })
  list(@CurrentWorkspace() actor: WorkspaceActor) {
    return this.ports.profiles.list(actor.workspaceId);
  }

  @Get(':owner/:name')
  @ApiOkResponse({ schema: jsonSchema(RepoProfileSchema) })
  get(@Param('owner') owner: string, @Param('name') name: string, @CurrentWorkspace() actor: WorkspaceActor) {
    return this.owned(`${owner}/${name}`, actor);
  }

  @Put(':owner/:name')
  @ApiOperation({ summary: 'Create or replace a repository profile; gate commands must be allowed commands' })
  @ApiBody({ schema: jsonSchema(ProfileBody) })
  @ApiOkResponse({ schema: jsonSchema(RepoProfileSchema) })
  async put(@Param('owner') owner: string, @Param('name') name: string, @Body() body: unknown, @CurrentWorkspace('configure') actor: WorkspaceActor) {
    const repo = `${owner}/${name}`;
    const existing = await this.ports.profiles.get(repo);
    if (existing && existing.workspaceId !== actor.workspaceId) throw new DomainError('forbidden', { reason: 'this repository is configured in another workspace' });
    const { connectionId, ...input } = parseBody(ProfileBody, body);
    const profile = { ...repoProfile({ repo, ...input }), ...(connectionId ? { connectionId } : {}), workspaceId: actor.workspaceId };
    await this.ports.profiles.save(profile);
    return profile;
  }

  @Delete(':owner/:name')
  @HttpCode(204)
  async remove(@Param('owner') owner: string, @Param('name') name: string, @CurrentWorkspace('configure') actor: WorkspaceActor) {
    const { repo } = await this.owned(`${owner}/${name}`, actor);
    await this.ports.profiles.remove(repo);
  }

  /** A repository of another workspace does not exist as far as this one can tell. */
  private async owned(repo: string, actor: WorkspaceActor): Promise<RepoProfile> {
    const profile = await this.ports.profiles.get(repo);
    if (!profile || profile.workspaceId !== actor.workspaceId) throw new NotFoundException(`no profile for ${repo} in this workspace`);
    return profile;
  }
}
