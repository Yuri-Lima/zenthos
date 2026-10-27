import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Post, Query, Res } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { githubAppManifest, manifestFormUrl } from '@zenthos/adapter-github';
import { connectExistingGitHubApp, connectGitHubApp, platformStatus } from '@zenthos/application';
import { DomainError, PlatformStatusSchema } from '@zenthos/domain';
import type { Response } from 'express';
import { z } from 'zod';
import { Public } from '../auth/session.guard.js';
import type { ApiConfig } from '../config.js';
import { jsonSchema, parseBody } from '../openapi.js';
import { API_PORTS, type ApiPorts } from '../ports.js';

const SetupToken = z.object({ token: z.string().min(1) });
const ManifestBody = SetupToken.extend({ name: z.string().min(1).default('zenthos'), owner: z.string().optional() });
const AppBody = SetupToken.extend({ name: z.string().min(1), appId: z.string().min(1), privateKey: z.string().min(1), webhookSecret: z.string().min(1).optional(), clientId: z.string().min(1).optional(), clientSecret: z.string().min(1).optional() });
const MANIFEST_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * The operator's one-time setup of the platform GitHub App (ADR 019). Nobody can sign in before it exists, so these
 * routes are public and guarded by the setup token the API prints at boot instead. Once the app exists they refuse.
 * The manifest makes the app public, so any account or organisation can install it; installing binds the
 * installation to the workspace of whoever installs (github.controller).
 */
@ApiTags('platform')
@Controller('platform')
export class PlatformController {
  /** state → the connection id the manifest was issued for, until it expires. */
  private readonly pendingManifests = new Map<string, { connectionId: string; expiresAt: number }>();

  constructor(
    @Inject(API_PORTS) private readonly ports: ApiPorts,
    @Inject('ApiConfig') private readonly config: ApiConfig,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Whether the platform GitHub App is set up, its slug and where it installs' })
  @ApiOkResponse({ schema: jsonSchema(PlatformStatusSchema) })
  status() {
    return platformStatus(this.ports);
  }

  @Public()
  @Post('github/manifest')
  @ApiOperation({ summary: 'Start creating the platform app from the manifest: a page that submits it to GitHub. Takes the setup token the API printed at boot' })
  @ApiBody({ schema: jsonSchema(ManifestBody) })
  async startManifest(@Body() body: unknown, @Res() res: Response) {
    const { name, owner } = await this.setup(parseBody(ManifestBody, body));
    const state = randomBytes(16).toString('hex');
    const connectionId = globalThis.crypto.randomUUID();
    this.pendingManifests.set(state, { connectionId, expiresAt: Date.now() + MANIFEST_STATE_TTL_MS });
    const manifest = githubAppManifest({ name, baseUrl: this.config.ZENTHOS_API_BASE_URL });
    // GitHub takes the manifest as a POSTed form field, so the browser submits it on arrival.
    res.type('html').send(
      `<!doctype html><title>Creating the ZenthOs GitHub App</title><form id="m" method="post" action="${manifestFormUrl(state, owner)}">` +
        `<input type="hidden" name="manifest" value='${JSON.stringify(manifest).replace(/'/g, '&#39;')}'><noscript><button>Create the GitHub App</button></noscript></form>` +
        `<script>document.getElementById('m').submit()</script>`,
    );
  }

  @Public()
  @Get('github/manifest/callback')
  @ApiOperation({ summary: 'GitHub returns here with the manifest code; the app becomes the platform app and the browser goes to the dashboard' })
  async finishManifest(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const pending = this.pendingManifests.get(state);
    this.pendingManifests.delete(state);
    if (!pending || pending.expiresAt < Date.now()) throw new NotFoundException('unknown or expired manifest state');
    if ((await platformStatus(this.ports)).configured) throw new DomainError('platform_already_configured');
    await connectGitHubApp(this.ports, await this.ports.githubApps.exchangeManifestCode(code), pending.connectionId);
    res.redirect(`${this.config.ZENTHOS_DASHBOARD_ORIGIN}/`);
  }

  @Public()
  @Post('github/app')
  @HttpCode(201)
  @ApiOperation({ summary: 'Make an app created by hand on GitHub the platform app: app id, private key, webhook secret and the OAuth client for Sign in with GitHub. Takes the setup token' })
  @ApiBody({ schema: jsonSchema(AppBody) })
  @ApiOkResponse({ schema: jsonSchema(PlatformStatusSchema) })
  async connectApp(@Body() body: unknown) {
    const { name, appId, privateKey, webhookSecret, clientId, clientSecret } = await this.setup(parseBody(AppBody, body));
    await connectExistingGitHubApp(this.ports, { name, appId, privateKey, webhookSecret, clientId, clientSecret });
    return platformStatus(this.ports);
  }

  /** The two conditions every setup route shares: no platform app yet, and the operator's token. */
  private async setup<T extends { token: string }>(input: T): Promise<T> {
    if ((await platformStatus(this.ports)).configured) throw new DomainError('platform_already_configured');
    const expected = Buffer.from(this.config.ZENTHOS_SETUP_TOKEN);
    const given = Buffer.from(input.token);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new DomainError('setup_token_invalid');
    return input;
  }
}
