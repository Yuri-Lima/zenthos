import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isSessionExpired, type Session } from '@zenthos/domain';
import type { Request } from 'express';
import type { ApiConfig } from '../config.js';
import { API_PORTS, type ApiPorts } from '../ports.js';

export const SESSION_COOKIE = 'zenthos_session';
const PUBLIC = 'zenthos:public';

/** Marks a route anyone may call: health, the webhook, and the sign-in flow itself. */
export const Public = () => SetMetadata(PUBLIC, true);

/** The signed-in person's login, or undefined when auth is off. */
export const CurrentLogin = createParamDecorator((_data: unknown, context: ExecutionContext): string | undefined => {
  const request = context.switchToHttp().getRequest<Request & { session?: Session }>();
  return request.session?.user.login;
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
 * httpOnly cookie; the store keeps only its hash. Expired sessions are refused and removed.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(API_PORTS) private readonly ports: ApiPorts,
    @Inject('ApiConfig') private readonly config: ApiConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.config.ZENTHOS_AUTH === 'off') return true;
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<Request & { session?: Session }>();
    const id = cookieValue(request.headers.cookie, SESSION_COOKIE);
    const session = id ? await this.ports.sessions.get(id) : undefined;
    if (!session) throw new UnauthorizedException('sign in first');
    if (isSessionExpired(session)) {
      await this.ports.sessions.remove(session.id);
      throw new UnauthorizedException('session expired, sign in again');
    }
    request.session = session;
    return true;
  }
}
