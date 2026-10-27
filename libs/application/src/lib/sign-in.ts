import { DomainError, type Session } from '@zenthos/domain';
import type { GitHubAppsPort, ProviderConnectionsPort, SessionsPort, WorkspacesPort } from '@zenthos/ports';

export type SignInDeps = { githubApps: GitHubAppsPort; connections: ProviderConnectionsPort; sessions: SessionsPort; workspaces: WorkspacesPort };

export type SignInInput = {
  code: string;
  redirectUri: string;
  /** The session id the API minted; a random secret the browser will hold. */
  sessionId: string;
  ttlHours: number;
  now?: Date;
};

/**
 * Use case 12: Sign in with GitHub through the connected App (ADR 007). Anyone GitHub vouches for gets a session
 * (ADR 019); what they see is decided by the workspaces they belong to. The session opens in their first workspace.
 * A person with no workspace claims the one the migration left without members, when there is one; otherwise the
 * dashboard asks them to create one.
 */
export async function signInWithGitHub({ githubApps, connections, sessions, workspaces }: SignInDeps, input: SignInInput): Promise<Session> {
  const app = (await connections.platformApp())?.app;
  if (!app?.clientId || !app.clientSecret) throw new DomainError('sign_in_unavailable');
  const user = await githubApps.signInUser({ clientId: app.clientId, clientSecret: app.clientSecret }, input.code, input.redirectUri);
  const now = input.now ?? new Date();
  let memberships = await workspaces.listForLogin(user.login);
  if (memberships.length === 0) {
    const [legacy] = await workspaces.unclaimed();
    if (legacy) {
      await workspaces.saveMember({ workspaceId: legacy.id, login: user.login, role: 'owner', createdAt: now.toISOString() });
      memberships = [{ workspace: legacy, role: 'owner' }];
    }
  }
  const session: Session = {
    id: input.sessionId,
    user,
    ...(memberships[0] ? { workspaceId: memberships[0].workspace.id } : {}),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.ttlHours * 3_600_000).toISOString(),
  };
  await sessions.save(session);
  return session;
}
