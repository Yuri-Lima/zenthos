import { randomBytes } from 'node:crypto';
import { Controller, Get, HttpCode, Inject, NotFoundException, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { signInWithGitHub } from '@zenthos/application';
import { WORKSPACE_ROLES, WorkspaceSchema } from '@zenthos/domain';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ApiConfig } from '../config.js';
import { jsonSchema } from '../openapi.js';
import { API_PORTS, type ApiPorts } from '../ports.js';
import { cookieValue, Public, SESSION_COOKIE, type ApiRequest } from './session.guard.js';

const STATE_TTL_MS = 10 * 60 * 1000;
const MeSchema = z.object({
  login: z.string(),
  id: z.number().int().optional(),
  avatarUrl: z.url().optional(),
  anonymous: z.boolean().optional(),
  /** The workspace the session works in and the person's role there; absent until they create or are invited into one. */
  workspace: WorkspaceSchema.extend({ role: z.enum(WORKSPACE_ROLES) }).optional(),
});

/**
 * Sign in with GitHub through the connected App (ADR 007): `GET /auth/github` sends the browser to GitHub,
 * GitHub returns to `callback` with a code, the use case turns it into a session, and the cookie carries
 * the session id back to the dashboard. Anyone may sign in; workspaces decide what they see (ADR 019).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  /** state → where to send the person afterwards, until it expires. */
  private readonly pending = new Map<string, { returnTo: string; expiresAt: number }>();

  constructor(
    @Inject(API_PORTS) private readonly ports: ApiPorts,
    @Inject('ApiConfig') private readonly config: ApiConfig,
  ) {}

  private get redirectUri() {
    return `${this.config.ZENTHOS_API_BASE_URL}/auth/github/callback`;
  }

  @Public()
  @Get('github')
  @ApiOperation({ summary: 'Start Sign in with GitHub; redirects to GitHub' })
  async start(@Query('returnTo') returnTo = '/', @Res() res: Response) {
    const app = (await this.ports.connections.signInApp())?.app;
    if (!app?.clientId) throw new NotFoundException('no GitHub App connection carries OAuth credentials, so nobody can sign in yet');
    const state = randomBytes(16).toString('hex');
    this.pending.set(state, { returnTo: returnTo.startsWith('/') ? returnTo : '/', expiresAt: Date.now() + STATE_TTL_MS });
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', app.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('state', state);
    res.redirect(url.toString());
  }

  @Public()
  @Get('github/callback')
  @ApiOperation({ summary: 'GitHub returns here; the person becomes a session and goes back to the dashboard' })
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const pending = this.pending.get(state);
    this.pending.delete(state);
    if (!pending || pending.expiresAt < Date.now()) throw new UnauthorizedException('unknown or expired sign-in state');
    const session = await signInWithGitHub(this.ports, {
      code,
      redirectUri: this.redirectUri,
      sessionId: randomBytes(32).toString('hex'),
      ttlHours: this.config.ZENTHOS_SESSION_HOURS,
    });
    res.cookie(SESSION_COOKIE, session.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: !this.config.ZENTHOS_API_BASE_URL.startsWith('http://localhost'),
      expires: new Date(session.expiresAt),
      path: '/',
    });
    res.redirect(`${this.config.ZENTHOS_DASHBOARD_ORIGIN}${pending.returnTo}`);
  }

  @Get('me')
  @ApiOperation({ summary: 'Who is signed in and in which workspace; 401 otherwise. With ZENTHOS_AUTH=off, the anonymous marker in the dry-run workspace' })
  @ApiOkResponse({ schema: jsonSchema(MeSchema) })
  me(@Req() request: ApiRequest): z.infer<typeof MeSchema> {
    const workspace = request.workspace && { ...request.workspace.workspace, role: request.workspace.role };
    return { ...(request.session?.user ?? { login: 'anonymous', anonymous: true }), ...(workspace ? { workspace } : {}) };
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'End the session and clear the cookie' })
  async logout(@Req() request: Request, @Res() res: Response) {
    const id = cookieValue(request.headers.cookie, SESSION_COOKIE);
    if (id) await this.ports.sessions.remove(id);
    res.clearCookie(SESSION_COOKIE, { path: '/' }).send();
  }
}
