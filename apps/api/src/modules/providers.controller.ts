import { randomBytes } from 'node:crypto';
import { Controller, Get, Inject, NotFoundException, Post, Query, Res, Body, Delete, Param, HttpCode } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { githubAppManifest, manifestFormUrl } from '@zenthos/adapter-github';
import { connectGitHubApp, connectGitHubToken, recordInstallation } from '@zenthos/application';
import { installUrl, redactConnection } from '@zenthos/domain';
import type { Response } from 'express';
import { z } from 'zod';
import { API_PORTS, type ApiPorts } from '../ports.js';
import type { ApiConfig } from '../config.js';
import { jsonSchema, parseBody } from '../openapi.js';

const TokenBody = z.object({ name: z.string().min(1), token: z.string().min(1) });
const MANIFEST_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Provider connections (ADR 006, ADR 007). The GitHub App flow: `GET /providers/github/manifest` sends the
 * person to GitHub with the manifest and a one-time state; GitHub comes back to `manifest/callback` with a
 * code the API exchanges for the app's credentials; the app's setup URL then brings the person to
 * `install/callback` with the installation id, which is read from GitHub and recorded.
 */
@ApiTags('providers')
@Controller('providers')
export class ProvidersController {
  /** state → the connection id the manifest was issued for, until it expires. */
  private readonly pendingManifests = new Map<string, { connectionId: string; expiresAt: number }>();

  constructor(
    @Inject(API_PORTS) private readonly ports: ApiPorts,
    @Inject('ApiConfig') private readonly config: ApiConfig,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List provider connections, secrets redacted' })
  async list() {
    return (await this.ports.connections.list()).map(redactConnection);
  }

  @Post('github/token')
  @ApiOperation({ summary: 'Connect GitHub with a personal token (interim for one account)' })
  @ApiBody({ schema: jsonSchema(TokenBody) })
  async connectToken(@Body() body: unknown) {
    const { name, token } = parseBody(TokenBody, body);
    return redactConnection(await connectGitHubToken(this.ports, name, token));
  }

  @Get('github/manifest')
  @ApiOperation({ summary: 'Start creating a GitHub App from the manifest; redirects to GitHub' })
  startManifest(@Query('name') name = 'zenthos', @Query('owner') owner: string | undefined, @Res() res: Response) {
    const state = randomBytes(16).toString('hex');
    const connectionId = globalThis.crypto.randomUUID();
    this.pendingManifests.set(state, { connectionId, expiresAt: Date.now() + MANIFEST_STATE_TTL_MS });
    const manifest = githubAppManifest({ name, baseUrl: this.config.ZENTHOS_API_BASE_URL, connectionId });
    // GitHub takes the manifest as a POSTed form field, so the browser submits it on arrival.
    res.type('html').send(
      `<!doctype html><title>Connecting GitHub</title><form id="m" method="post" action="${manifestFormUrl(state, owner)}">` +
        `<input type="hidden" name="manifest" value='${JSON.stringify(manifest).replace(/'/g, '&#39;')}'><noscript><button>Create the GitHub App</button></noscript></form>` +
        `<script>document.getElementById('m').submit()</script>`,
    );
  }

  @Get('github/manifest/callback')
  @ApiOperation({ summary: 'GitHub returns here with the manifest code; the app becomes a connection' })
  async finishManifest(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const pending = this.pendingManifests.get(state);
    this.pendingManifests.delete(state);
    if (!pending || pending.expiresAt < Date.now()) throw new NotFoundException('unknown or expired manifest state');
    const result = await this.ports.githubApps.exchangeManifestCode(code);
    const connection = await connectGitHubApp(this.ports, result, pending.connectionId);
    res.redirect(installUrl(connection) ?? '/providers');
  }

  @Get('github/install/callback')
  @ApiOperation({ summary: 'GitHub returns here after an install; the installation is read and recorded' })
  async finishInstall(@Query('connection') connectionId: string, @Query('installation_id') installationId: string) {
    const connection = await this.ports.connections.get(connectionId);
    if (!connection || connection.credentials.type !== 'github-app') throw new NotFoundException('no GitHub App connection with that id');
    const installation = await this.ports.githubApps.describeInstallation(connection.credentials, Number(installationId));
    return redactConnection(await recordInstallation(this.ports, connectionId, installation));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a connection; profiles that used it keep working only through the environment' })
  async remove(@Param('id') id: string) {
    await this.ports.connections.remove(id);
  }
}
