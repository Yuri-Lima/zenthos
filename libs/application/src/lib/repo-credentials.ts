import { coversRepository, DomainError, installUrl, workspaceInstallations, type GitHubCredentials } from '@zenthos/domain';
import type { ProviderConnectionsPort, RepoProfilesPort } from '@zenthos/ports';

export type RepoCredentialsDeps = { profiles: RepoProfilesPort; connections: ProviderConnectionsPort };

/**
 * Use case 11: the credentials the pipeline acts with on a repository. The platform app acts wherever an installation
 * bound to the repository's workspace covers it (ADR 019); a profile that still names a connection of its own uses
 * that (ADR 006). A profile with neither falls back to what the process was given, which is how a laptop runs with one
 * app in `.env`; with nothing, the run stops before touching the provider.
 */
export async function credentialsForRepo({ profiles, connections }: RepoCredentialsDeps, repo: string, fallback?: GitHubCredentials): Promise<GitHubCredentials> {
  const profile = await profiles.get(repo);
  if (profile?.connectionId) {
    const connection = await connections.get(profile.connectionId);
    if (!connection) throw new DomainError('connection_not_found', { repo, connectionId: profile.connectionId });
    return connection.credentials;
  }
  const app = profile?.workspaceId ? await connections.platformApp() : undefined;
  if (app) {
    if (coversRepository(workspaceInstallations(app, profile?.workspaceId ?? ''), repo)) return app.credentials;
    throw new DomainError('app_not_installed', { repo, app: app.app?.slug, installUrl: installUrl(app) });
  }
  if (!fallback) throw new DomainError('no_credentials', { repo });
  return fallback;
}
