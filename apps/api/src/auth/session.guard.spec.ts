import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createWorkspace, DRY_RUN_WORKSPACE } from '@zenthos/domain';
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
  const { workspace, membership } = createWorkspace('Acme', 'yuri');
  const live = { id: 'l'.repeat(64), user: { login: 'yuri', id: 1 }, workspaceId: workspace.id, createdAt: '2026-10-18T10:00:00.000Z', expiresAt: '2999-01-01T00:00:00.000Z' };
  const stale = { ...live, id: 's'.repeat(64), expiresAt: '2020-01-01T00:00:00.000Z' };
  beforeAll(async () => {
    await ports.sessions.save(live);
    await ports.sessions.save(stale);
    await ports.workspaces.save(workspace);
    await ports.workspaces.saveMember(membership);
  });

  it('lets everything through when auth is off, acting as the owner of the dry-run workspace', async () => {
    const guard = new SessionGuard(new Reflector(), ports, loadConfig({}));
    const context = contextFor();
    expect(await guard.canActivate(context)).toBe(true);
    expect((context.switchToHttp().getRequest() as { workspace?: { workspaceId: string; role: string } }).workspace).toMatchObject({ workspaceId: DRY_RUN_WORKSPACE.id, role: 'owner' });
  });

  it('with auth on: public routes pass, a live cookie passes and attaches the session and its workspace, no cookie or an expired one is refused', async () => {
    const guard = new SessionGuard(new Reflector(), ports, loadConfig({ ZENTHOS_AUTH: 'github' }));
    expect(await guard.canActivate(contextFor(undefined, true))).toBe(true);
    const context = contextFor(`${SESSION_COOKIE}=${live.id}; other=1`);
    expect(await guard.canActivate(context)).toBe(true);
    const request = context.switchToHttp().getRequest() as { session?: { user: { login: string } }; workspace?: { workspaceId: string; role: string; login: string } };
    expect(request.session?.user.login).toBe('yuri');
    expect(request.workspace).toMatchObject({ workspaceId: workspace.id, role: 'owner', login: 'yuri' });
    await expect(guard.canActivate(contextFor())).rejects.toThrow(/sign in/);
    await expect(guard.canActivate(contextFor(`${SESSION_COOKIE}=${stale.id}`))).rejects.toThrow(/expired/);
    expect(await ports.sessions.get(stale.id)).toBeUndefined();
  });

  it('reads one cookie out of a header', () => {
    expect(cookieValue('a=1; zenthos_session=abc%3D; b=2', 'zenthos_session')).toBe('abc=');
    expect(cookieValue(undefined, 'x')).toBeUndefined();
  });
});
