import { createConnection, type ProviderConnection, type Session } from '@zenthos/domain';
import type { GitHubAppsPort, ProviderConnectionsPort, SessionsPort } from '@zenthos/ports';
import { signInWithGitHub } from './sign-in.js';

const withOAuth = createConnection({ provider: 'github', name: 'app', credentials: { type: 'github-app', appId: '1', privateKey: 'pem' }, app: { slug: 'app', webhookSecret: 's', clientId: 'Iv1.x', clientSecret: 'cs' } });
const withoutOAuth = createConnection({ provider: 'github', name: 'plain', credentials: { type: 'github-app', appId: '2', privateKey: 'pem' } });
const connectionsOf = (list: ProviderConnection[]): ProviderConnectionsPort => ({ get: async () => undefined, findByAppId: async () => undefined, list: async () => list, save: async () => undefined, remove: async () => undefined });
const githubApps: GitHubAppsPort = { exchangeManifestCode: async () => { throw new Error('unused'); }, describeInstallation: async () => { throw new Error('unused'); }, signInUser: async (_app, code) => ({ login: code, id: 7 }) };
const sessionsOf = (created: Session[]): SessionsPort => ({ create: async (s) => void created.push(s), get: async () => undefined, remove: async () => undefined });
const input = { code: 'Yuri', redirectUri: 'http://localhost:3200/auth/github/callback', allowedLogins: ['yuri'], sessionId: 'x'.repeat(64), ttlHours: 24, now: new Date('2026-10-18T10:00:00Z') };

describe('signInWithGitHub', () => {
  it('signs in an allowed login, case-insensitively, with a session that expires', async () => {
    const created: Session[] = [];
    const session = await signInWithGitHub({ githubApps, connections: connectionsOf([withoutOAuth, withOAuth]), sessions: sessionsOf(created) }, input);
    expect(session.user.login).toBe('Yuri');
    expect(session.expiresAt).toBe('2026-10-19T10:00:00.000Z');
    expect(created).toEqual([session]);
  });

  it('refuses a login off the allowlist and never creates a session', async () => {
    const created: Session[] = [];
    await expect(signInWithGitHub({ githubApps, connections: connectionsOf([withOAuth]), sessions: sessionsOf(created) }, { ...input, code: 'stranger' })).rejects.toMatchObject({ code: 'not_allowed' });
    expect(created).toEqual([]);
  });

  it('says so when no connection carries OAuth credentials', async () => {
    await expect(signInWithGitHub({ githubApps, connections: connectionsOf([withoutOAuth]), sessions: sessionsOf([]) }, input)).rejects.toMatchObject({ code: 'sign_in_unavailable' });
  });
});
