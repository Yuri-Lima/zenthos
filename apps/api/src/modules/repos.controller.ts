import { Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Put } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { repoProfile } from '@zenthos/domain';
import { z } from 'zod';
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

/** Repository profiles (ADR 006): what the pipeline may do in each repository, edited here, read by the worker. */
@ApiTags('repos')
@Controller('repos')
export class ReposController {
  constructor(@Inject(API_PORTS) private readonly ports: ApiPorts) {}

  @Get()
  @ApiOperation({ summary: 'List repository profiles' })
  list() {
    return this.ports.profiles.list();
  }

  @Get(':owner/:name')
  async get(@Param('owner') owner: string, @Param('name') name: string) {
    const profile = await this.ports.profiles.get(`${owner}/${name}`);
    if (!profile) throw new NotFoundException(`no profile for ${owner}/${name}`);
    return profile;
  }

  @Put(':owner/:name')
  @ApiOperation({ summary: 'Create or replace a repository profile; gate commands must be allowed commands' })
  @ApiBody({ schema: jsonSchema(ProfileBody) })
  async put(@Param('owner') owner: string, @Param('name') name: string, @Body() body: unknown) {
    const { connectionId, ...input } = parseBody(ProfileBody, body);
    const profile = { ...repoProfile({ repo: `${owner}/${name}`, ...input }), ...(connectionId ? { connectionId } : {}) };
    await this.ports.profiles.save(profile);
    return profile;
  }

  @Delete(':owner/:name')
  @HttpCode(204)
  async remove(@Param('owner') owner: string, @Param('name') name: string) {
    await this.ports.profiles.remove(`${owner}/${name}`);
  }
}
