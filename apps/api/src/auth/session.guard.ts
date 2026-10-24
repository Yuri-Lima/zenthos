import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { currentWorkspace } from '@zenthos/application';
import { assertCan, DomainError, DRY_RUN_WORKSPACE, isSessionExpired, type Session, type Workspace, type WorkspaceAction, type WorkspaceActor } from '@zenthos/domain';
import type { Request } from 'express';
import type { ApiConfig } from '../config.js';
import { API_PORTS, type ApiPorts } from '../ports.js';

export const SESSION_COOKIE = 'zenthos_session';
const PUBLIC = 'zenthos:public';

/** What the guard attaches: the session, and the workspace it works in with the person's role there (ADR 019). */
export type ApiRequest = Request & { session?: Session; workspace?: WorkspaceActor & { workspace: Workspace } };

/** With auth off every request acts as the owner of the one dry-run workspace, so nothing reads unscoped. */
const DRY_RUN_ACTOR: NonNullable<ApiRequest['workspace']> = { workspaceId: DRY_RUN_WORKSPACE.id, login: 'anonymous', role: 'owner', workspace: DRY_RUN_WORKSPACE };

/** Marks a route anyone may call: health, the webhook, and the sign-in flow itself. */
export const Public = () => SetMetadata(PUBLIC, true);

/** The signed-in person's login, or undefined when auth is off. */
export const CurrentLogin = createParamDecorator((_data: unknown, context: ExecutionContext): string | undefined => context.switchToHttp().getRequest<ApiRequest>().session?.user.login);

/** The session itself, for routes that change it; a 401 when auth is off, since there is none to change. */
export const CurrentSession = createParamDecorator((_data: unknown, context: ExecutionContext): Session => {
  const session = context.switchToHttp().getRequest<ApiRequest>().session;
  if (!session) throw new UnauthorizedException('sign in first');
  return session;
});

/**
 * The workspace the request works in, checked for the action the route performs. Without a selected workspace the
 * route refuses with `workspace_required`; with the wrong role, with `forbidden`.
 */
export const CurrentWorkspace = createParamDecorator((action: WorkspaceAction | undefined, context: ExecutionContext): NonNullable<ApiRequest['workspace']> => {
  const actor = context.switchToHttp().getRequest<ApiRequest>().workspace;
  if (!actor) throw new DomainError('workspace_required');
  if (action) assertCan(actor.role, action);
  return actor;
});

/** The one place a cookie header is read. */
export function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/**
 * Every route needs a live session unless it is public or ZENTHOS_AUTH is off. The session rides an
 * httpOnly cookie; the store keeps only its hash. Expired sessions are refused and removed. The session's
 * workspace is resolved here, once per request, with the person's current role in it.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(API_PORTS) private readonly ports: ApiPorts,
    @Inject('ApiConfig') private readonly config: ApiConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    if (this.config.ZENTHOS_AUTH === 'off') {
      request.workspace = DRY_RUN_ACTOR;
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const id = cookieValue(request.headers.cookie, SESSION_COOKIE);
    const session = id ? await this.ports.sessions.get(id) : undefined;
    if (!session) throw new UnauthorizedException('sign in first');
    if (isSessionExpired(session)) {
      await this.ports.sessions.remove(session.id);
      throw new UnauthorizedException('session expired, sign in again');
    }
    request.session = session;
    request.workspace = await currentWorkspace(this.ports, session);
    return true;
  }
}
