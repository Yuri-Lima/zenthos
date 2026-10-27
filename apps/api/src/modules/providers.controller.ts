import { randomBytes } from 'node:crypto';
import { Controller, Get, Inject, NotFoundException, Post, Query, Res, Body, Delete, Param, HttpCode } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { githubAppManifest, manifestFormUrl } from '@zenthos/adapter-github';
import { checkConnection, connectExistingGitHubApp, connectGitHubApp, describeRepository, recordInstallation } from '@zenthos/application';
import { ConnectionCheckSchema, installUrl, PublicConnectionSchema, redactConnection, RepositoryInfoSchema, type ProviderConnection, type WorkspaceActor } from '@zenthos/domain';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentWorkspace } from '../auth/session.guard.js';
import { API_PORTS, type ApiPorts } from '../ports.js';
import type { ApiConfig } from '../config.js';
import { jsonSchema, parseBody } from '../openapi.js';

const AppBody = z.object({ name: z.string().min(1), appId: z.string().min(1), privateKey: z.string().min(1), webhookSecret: z.string().min(1).optional(), clientId: z.string().min(1).optional(), clientSecret: z.string().min(1).optional() });
const MANIFEST_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Provider connections (ADR 006, ADR 007), each owned by a workspace (ADR 019). The GitHub App flow:
 * `GET /providers/github/manifest` sends the person to GitHub with the manifest and a one-time state; GitHub
 * comes back to `manifest/callback` with a code the API exchanges for the app's credentials; the app's setup
 * URL then brings the person to `install/callback` with the installation id, which is read from GitHub and recorded.
 */
@ApiTags('providers')
@Controller('providers')
export class ProvidersController {
  /** state → the connection id and workspace the manifest was issued for, until it expires. */
  private readonly pendingManifests = new Map<string, { connectionId: string; workspaceId: string; expiresAt: number }>();

  constructor(
    @Inject(API_PORTS) private readonly ports: ApiPorts,
    @Inject('ApiConfig') private readonly config: ApiConfig,
  ) {}

  @Get()
  @ApiOperation({ summary: "List the workspace's provider connections, secrets redacted" })
  @ApiOkResponse({ schema: jsonSchema(z.array(PublicConnectionSchema)) })
  async list(@CurrentWorkspace() actor: WorkspaceActor) {
    return (await this.ports.connections.list(actor.workspaceId)).map(redactConnection);
  }


  @Post('github/app')
  @ApiOperation({ summary: 'Connect a GitHub App created by hand: app id, private key, the webhook secret, and the OAuth client id and secret for Sign in with GitHub; the key is checked against GitHub first; the same app again updates it' })
  @ApiBody({ schema: jsonSchema(AppBody) })
  @ApiOkResponse({ schema: jsonSchema(PublicConnectionSchema) })
  async connectApp(@Body() body: unknown, @CurrentWorkspace('configure') actor: WorkspaceActor) {
    return redactConnection(await connectExistingGitHubApp(this.ports, { ...parseBody(AppBody, body), workspaceId: actor.workspaceId }));
  }

  @Get('github/manifest')
  @ApiOperation({ summary: 'Start creating a GitHub App from the manifest; redirects to GitHub' })
  startManifest(@Query('name') name = 'zenthos', @Query('owner') owner: string | undefined, @CurrentWorkspace('configure') actor: WorkspaceActor, @Res() res: Response) {
    const state = randomBytes(16).toString('hex');
    const connectionId = globalThis.crypto.randomUUID();
    this.pendingManifests.set(state, { connectionId, workspaceId: actor.workspaceId, expiresAt: Date.now() + MANIFEST_STATE_TTL_MS });
    const manifest = githubAppManifest({ name, baseUrl: this.config.ZENTHOS_API_BASE_URL, connectionId });
    // GitHub takes the manifest as a POSTed form field, so the browser submits it on arrival.
    res.type('html').send(
      `<!doctype html><title>Connecting GitHub</title><form id="m" method="post" action="${manifestFormUrl(state, owner)}">` +
        `<input type="hidden" name="manifest" value='${JSON.stringify(manifest).replace(/'/g, '&#39;')}'><noscript><button>Create the GitHub App</button></noscript></form>` +
        `<script>document.getElementById('m').submit()</script>`,
    );
  }

  @Get('github/manifest/callback')
  @ApiOperation({ summary: 'GitHub returns here with the manifest code; the app becomes a connection of the workspace that started the flow' })
  async finishManifest(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const pending = this.pendingManifests.get(state);
    this.pendingManifests.delete(state);
    if (!pending || pending.expiresAt < Date.now()) throw new NotFoundException('unknown or expired manifest state');
    const result = await this.ports.githubApps.exchangeManifestCode(code);
    const connection = await connectGitHubApp(this.ports, result, pending.connectionId, pending.workspaceId);
    res.redirect(installUrl(connection) ?? this.settingsUrl(connection.id));
  }

  @Get('github/install/callback')
  @ApiOperation({ summary: 'GitHub returns here after an install; the installation is read, recorded, and the browser goes back to the dashboard settings' })
  async finishInstall(@Query('connection') connectionId: string, @Query('installation_id') installationId: string, @CurrentWorkspace('configure') actor: WorkspaceActor, @Res() res: Response) {
    const connection = await this.owned(connectionId, actor);
    if (connection.credentials.type !== 'github-app') throw new NotFoundException('no GitHub App connection with that id');
    const installation = await this.ports.githubApps.describeInstallation(connection.credentials, Number(installationId));
    await recordInstallation(this.ports, connectionId, installation);
    res.redirect(this.settingsUrl(connectionId));
  }

  @Post(':id/check')
  @HttpCode(200)
  @ApiOperation({ summary: "Ask GitHub whether the stored credentials still work, and refresh an app's installations from GitHub; answers with who they act as and how many repositories they reach, or why not" })
  @ApiOkResponse({ schema: jsonSchema(ConnectionCheckSchema) })
  async check(@Param('id') id: string, @CurrentWorkspace() actor: WorkspaceActor) {
    await this.owned(id, actor);
    return checkConnection(this.ports, id);
  }

  @Get(':id/repositories/:owner/:name')
  @ApiOperation({ summary: "A repository as this connection's provider sees it: default branch and clone URL, for the profile form; 404 when the connection cannot see it" })
  @ApiOkResponse({ schema: jsonSchema(RepositoryInfoSchema) })
  async repository(@Param('id') id: string, @Param('owner') owner: string, @Param('name') name: string, @CurrentWorkspace() actor: WorkspaceActor) {
    await this.owned(id, actor);
    return describeRepository(this.ports, id, `${owner}/${name}`);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a connection; profiles that used it keep working only through the environment' })
  async remove(@Param('id') id: string, @CurrentWorkspace('configure') actor: WorkspaceActor) {
    await this.owned(id, actor);
    await this.ports.connections.remove(id);
  }

  /** A connection of another workspace does not exist as far as this one can tell. */
  private async owned(id: string, actor: WorkspaceActor): Promise<ProviderConnection> {
    const connection = await this.ports.connections.get(id);
    if (!connection || connection.workspaceId !== actor.workspaceId) throw new NotFoundException('no connection with that id in this workspace');
    return connection;
  }

  /** The dashboard's settings page, with the connection that just changed, so the page can say so. */
  private settingsUrl(connectionId: string) {
    return `${this.config.ZENTHOS_DASHBOARD_ORIGIN}/settings?connected=${encodeURIComponent(connectionId)}`;
  }
}
