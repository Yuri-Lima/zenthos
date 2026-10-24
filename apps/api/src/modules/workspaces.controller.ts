import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Req } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { actorIn, createWorkspaceFor, removeMember, selectWorkspace, setMember } from '@zenthos/application';
import { DRY_RUN_WORKSPACE, MembershipSchema, WORKSPACE_ROLES, WorkspaceSchema, type Session } from '@zenthos/domain';
import { z } from 'zod';
import { CurrentSession, type ApiRequest } from '../auth/session.guard.js';
import { jsonSchema, parseBody } from '../openapi.js';
import { API_PORTS, type ApiPorts } from '../ports.js';

const MineSchema = WorkspaceSchema.extend({ role: z.enum(WORKSPACE_ROLES), current: z.boolean() });
const CreateBody = z.object({ name: z.string().trim().min(1).max(60) });
const MemberBody = z.object({ role: z.enum(WORKSPACE_ROLES) });

/**
 * Workspaces and their members (ADR 019). A person sees the workspaces they belong to, works in one at a time
 * (the session remembers which), and owners manage members by GitHub login.
 */
@ApiTags('workspaces')
@Controller('workspaces')
export class WorkspacesController {
  constructor(@Inject(API_PORTS) private readonly ports: ApiPorts) {}

  @Get()
  @ApiOperation({ summary: 'The workspaces the signed-in person belongs to, with their role in each and which one the session is in' })
  @ApiOkResponse({ schema: jsonSchema(z.array(MineSchema)) })
  async mine(@Req() request: ApiRequest): Promise<z.infer<typeof MineSchema>[]> {
    if (!request.session) return [{ ...DRY_RUN_WORKSPACE, role: 'owner', current: true }];
    const session = request.session;
    return (await this.ports.workspaces.listForLogin(session.user.login)).map(({ workspace, role }) => ({ ...workspace, role, current: workspace.id === session.workspaceId }));
  }

  @Post()
  @ApiOperation({ summary: 'Create a workspace; the creator owns it and the session moves into it' })
  @ApiBody({ schema: jsonSchema(CreateBody) })
  @ApiOkResponse({ schema: jsonSchema(WorkspaceSchema) })
  create(@Body() body: unknown, @CurrentSession() session: Session) {
    return createWorkspaceFor(this.ports, session, parseBody(CreateBody, body).name);
  }

  @Post(':id/select')
  @HttpCode(204)
  @ApiOperation({ summary: 'Work in this workspace from now on; refused unless the person is a member' })
  async select(@Param('id') id: string, @CurrentSession() session: Session) {
    await selectWorkspace(this.ports, session, id);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'The members of a workspace the person belongs to' })
  @ApiOkResponse({ schema: jsonSchema(z.array(MembershipSchema)) })
  async members(@Param('id') id: string, @CurrentSession() session: Session) {
    await actorIn(this.ports, session.user.login, id);
    return this.ports.workspaces.members(id);
  }

  @Put(':id/members/:login')
  @ApiOperation({ summary: 'Invite a GitHub login into the workspace, or change their role; owners only, and the last owner stays' })
  @ApiBody({ schema: jsonSchema(MemberBody) })
  @ApiOkResponse({ schema: jsonSchema(MembershipSchema) })
  async setMember(@Param('id') id: string, @Param('login') login: string, @Body() body: unknown, @CurrentSession() session: Session) {
    return setMember(this.ports, await actorIn(this.ports, session.user.login, id), { login, role: parseBody(MemberBody, body).role });
  }

  @Delete(':id/members/:login')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a member; owners only, and the last owner stays' })
  async removeMember(@Param('id') id: string, @Param('login') login: string, @CurrentSession() session: Session) {
    await removeMember(this.ports, await actorIn(this.ports, session.user.login, id), login);
  }
}
