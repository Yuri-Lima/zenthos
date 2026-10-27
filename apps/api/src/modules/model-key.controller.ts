import { Body, Controller, Delete, Get, HttpCode, Inject, Put } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { modelKeyStatusOf, removeModelKey, setModelKey } from '@zenthos/application';
import { ModelKeyStatusSchema, type WorkspaceActor } from '@zenthos/domain';
import { z } from 'zod';
import { CurrentWorkspace } from '../auth/session.guard.js';
import { jsonSchema, parseBody } from '../openapi.js';
import { API_PORTS, type ApiPorts } from '../ports.js';

const KeyBody = z.object({ apiKey: z.string().trim().min(8) });

/**
 * The workspace's own model provider key (ADR 019): entered here, checked with the provider, sealed at rest, and
 * used by every agent of the workspace's runs. The API never returns it; the status names the provider and the
 * last four characters so a person can tell which key is in.
 */
@ApiTags('model-key')
@Controller('model-key')
export class ModelKeyController {
  constructor(@Inject(API_PORTS) private readonly ports: ApiPorts) {}

  @Get()
  @ApiOperation({ summary: 'Whether this workspace has a model provider key, which provider and its last four characters; never the key itself' })
  @ApiOkResponse({ schema: jsonSchema(ModelKeyStatusSchema) })
  status(@CurrentWorkspace() actor: WorkspaceActor) {
    return modelKeyStatusOf(this.ports, actor.workspaceId);
  }

  @Put()
  @ApiOperation({ summary: "Enter or replace the workspace's Anthropic API key: checked with Anthropic first, then stored sealed; owners and admins" })
  @ApiBody({ schema: jsonSchema(KeyBody) })
  @ApiOkResponse({ schema: jsonSchema(ModelKeyStatusSchema) })
  set(@Body() body: unknown, @CurrentWorkspace('configure') actor: WorkspaceActor) {
    return setModelKey(this.ports, actor, parseBody(KeyBody, body).apiKey);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: "Remove the workspace's key; its runs fall back to the deployment's own credentials, if any; owners and admins" })
  async remove(@CurrentWorkspace('configure') actor: WorkspaceActor) {
    await removeModelKey(this.ports, actor);
  }
}
