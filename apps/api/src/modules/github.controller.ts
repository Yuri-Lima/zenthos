import { randomBytes } from 'node:crypto';
import { Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { claimInstallation, describeRepository, installationsOf, platformStatus, releaseInstallation } from '@zenthos/application';
import { DomainError, InstallationSchema, RepositoryInfoSchema, type WorkspaceActor } from '@zenthos/domain';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentWorkspace } from '../auth/session.guard.js';
import type { ApiConfig } from '../config.js';
import { jsonSchema } from '../openapi.js';
import { API_PORTS, type ApiPorts } from '../ports.js';

const INSTALL_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * A workspace's installations of the platform app (ADR 019). `install` sends the person to GitHub with a one-time
 * state naming the workspace; GitHub brings them back to `install/callback` with the installation id, which is
 * claimed for the workspace once it is theirs to claim (platform.controller sets the app up; webhooks.service
 * keeps the installations current).
 */
@ApiTags('github')
@Controller('github')
export class GithubController {
  /** state → the workspace the install was started from, until it expires. */
  private readonly pendingInstalls = new Map<string, { workspaceId: string; expiresAt: number }>();

  constructor(
    @Inject(API_PORTS) private readonly ports: ApiPorts,
    @Inject('ApiConfig') private readonly config: ApiConfig,
  ) {}

  @Get('installations')
  @ApiOperation({ summary: "The installations this workspace has claimed, with the repositories each covers" })
  @ApiOkResponse({ schema: jsonSchema(z.array(InstallationSchema)) })
  installations(@CurrentWorkspace() actor: WorkspaceActor) {
    return installationsOf(this.ports, actor.workspaceId);
  }

  @Get('install')
  @ApiOperation({ summary: 'Install the platform app on an account or organisation for this workspace; redirects to GitHub' })
  async install(@CurrentWorkspace('configure') actor: WorkspaceActor, @Res() res: Response) {
    const status = await platformStatus(this.ports);
    if (!status.installUrl) throw new DomainError('platform_not_configured');
    const state = randomBytes(16).toString('hex');
    this.pendingInstalls.set(state, { workspaceId: actor.workspaceId, expiresAt: Date.now() + INSTALL_STATE_TTL_MS });
    res.redirect(`${status.installUrl}?state=${state}`);
  }

  @Get('install/callback')
  @ApiOperation({ summary: 'GitHub returns here after an install; the installation is claimed for the workspace and the browser goes back to the dashboard settings' })
  async finishInstall(@Query('installation_id') installationId: string, @Query('state') state: string | undefined, @CurrentWorkspace('configure') actor: WorkspaceActor, @Res() res: Response) {
    // A state is set when the install started here; one that names another workspace is refused. Installs started on GitHub itself carry none.
    if (state) {
      const pending = this.pendingInstalls.get(state);
      this.pendingInstalls.delete(state);
      if (!pending || pending.expiresAt < Date.now() || pending.workspaceId !== actor.workspaceId) throw new NotFoundException('unknown or expired install state');
    }
    const installation = await claimInstallation(this.ports, actor, Number(installationId), this.config.ZENTHOS_AUTH === 'off');
    res.redirect(`${this.config.ZENTHOS_DASHBOARD_ORIGIN}/settings?installed=${installation.installationId}`);
  }

  @Delete('installations/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Release an installation from this workspace; the app stays installed on GitHub until its owner removes it there' })
  async release(@Param('id') id: string, @CurrentWorkspace('configure') actor: WorkspaceActor) {
    await releaseInstallation(this.ports, actor, Number(id));
  }

  @Get('repositories/:owner/:name')
  @ApiOperation({ summary: "A repository one of the workspace's installations covers, as GitHub sees it: default branch and clone URL, for the profile form" })
  @ApiOkResponse({ schema: jsonSchema(RepositoryInfoSchema) })
  repository(@Param('owner') owner: string, @Param('name') name: string, @CurrentWorkspace() actor: WorkspaceActor) {
    return describeRepository(this.ports, actor.workspaceId, `${owner}/${name}`);
  }
}
