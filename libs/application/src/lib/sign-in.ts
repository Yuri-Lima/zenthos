import { DomainError, isLoginAllowed, type Session } from '@zenthos/domain';
import type { GitHubAppsPort, ProviderConnectionsPort, SessionsPort } from '@zenthos/ports';

export type SignInDeps = { githubApps: GitHubAppsPort; connections: ProviderConnectionsPort; sessions: SessionsPort };

export type SignInInput = {
  code: string;
  redirectUri: string;
  allowedLogins: readonly string[];
  /** The session id the API minted; a random secret the browser will hold. */
  sessionId: string;
  ttlHours: number;
  now?: Date;
};

/**
 * Use case 12: Sign in with GitHub through the connected App (ADR 007). The App whose OAuth credentials
 * are stored vouches for the person; the allowlist decides whether they may use the dashboard (ADR 012).
 */
export async function signInWithGitHub({ githubApps, connections, sessions }: SignInDeps, input: SignInInput): Promise<Session> {
  const app = (await connections.list()).find((c) => c.app?.clientId && c.app.clientSecret)?.app;
  if (!app?.clientId || !app.clientSecret) throw new DomainError('sign_in_unavailable');
  const user = await githubApps.signInUser({ clientId: app.clientId, clientSecret: app.clientSecret }, input.code, input.redirectUri);
  if (!isLoginAllowed(user.login, input.allowedLogins)) throw new DomainError('not_allowed', { login: user.login });
  const now = input.now ?? new Date();
  const session: Session = { id: input.sessionId, user, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + input.ttlHours * 3_600_000).toISOString() };
  await sessions.create(session);
  return session;
}
