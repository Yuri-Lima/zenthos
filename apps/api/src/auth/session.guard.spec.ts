import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { loadConfig } from '../config.js';
import { inMemoryPorts } from '../ports.js';
import { cookieValue, SESSION_COOKIE, SessionGuard } from './session.guard.js';

const contextFor = (cookie?: string, handlerPublic = false): ExecutionContext => {
  const request: { headers: { cookie?: string }; session?: unknown } = { headers: cookie ? { cookie } : {} };
  const handler = () => undefined;
  if (handlerPublic) Reflect.defineMetadata('zenthos:public', true, handler);
  return { getHandler: () => handler, getClass: () => class {}, switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
};

describe('SessionGuard', () => {
  const ports = inMemoryPorts();
  const live = { id: 'l'.repeat(64), user: { login: 'yuri', id: 1 }, createdAt: '2026-10-18T10:00:00.000Z', expiresAt: '2999-01-01T00:00:00.000Z' };
  const stale = { ...live, id: 's'.repeat(64), expiresAt: '2020-01-01T00:00:00.000Z' };
  beforeAll(async () => {
    await ports.sessions.create(live);
    await ports.sessions.create(stale);
  });

  it('lets everything through when auth is off', async () => {
    const guard = new SessionGuard(new Reflector(), ports, loadConfig({}));
    expect(await guard.canActivate(contextFor())).toBe(true);
  });

  it('with auth on: public routes pass, a live cookie passes and attaches the session, no cookie or an expired one is refused', async () => {
    const guard = new SessionGuard(new Reflector(), ports, loadConfig({ ZENTHOS_AUTH: 'github', ZENTHOS_ALLOWED_LOGINS: 'yuri' }));
    expect(await guard.canActivate(contextFor(undefined, true))).toBe(true);
    const context = contextFor(`${SESSION_COOKIE}=${live.id}; other=1`);
    expect(await guard.canActivate(context)).toBe(true);
    expect((context.switchToHttp().getRequest() as { session?: { user: { login: string } } }).session?.user.login).toBe('yuri');
    await expect(guard.canActivate(contextFor())).rejects.toThrow(/sign in/);
    await expect(guard.canActivate(contextFor(`${SESSION_COOKIE}=${stale.id}`))).rejects.toThrow(/expired/);
    expect(await ports.sessions.get(stale.id)).toBeUndefined();
  });

  it('reads one cookie out of a header', () => {
    expect(cookieValue('a=1; zenthos_session=abc%3D; b=2', 'zenthos_session')).toBe('abc=');
    expect(cookieValue(undefined, 'x')).toBeUndefined();
  });

  it('refuses auth on without an allowlist', () => {
    expect(() => loadConfig({ ZENTHOS_AUTH: 'github' })).toThrow(/ALLOWED_LOGINS/);
  });
});
