import { DomainError, type GitHubCredentials } from '@zenthos/domain';
import type { ProviderConnectionsPort, RepoProfilesPort } from '@zenthos/ports';

export type RepoCredentialsDeps = { profiles: RepoProfilesPort; connections: ProviderConnectionsPort };

/**
 * Use case 11: the credentials the pipeline acts with on a repository come from the connection its
 * profile names (ADR 006). A profile without one falls back to what the process was given, which is
 * how a laptop runs with one app in `.env`; with neither, the run stops before touching the provider.
 */
export async function credentialsForRepo({ profiles, connections }: RepoCredentialsDeps, repo: string, fallback?: GitHubCredentials): Promise<GitHubCredentials> {
  const profile = await profiles.get(repo);
  const connection = profile?.connectionId ? await connections.get(profile.connectionId) : undefined;
  if (profile?.connectionId && !connection) throw new DomainError('connection_not_found', { repo, connectionId: profile.connectionId });
  const credentials = connection?.credentials ?? fallback;
  if (!credentials) throw new DomainError('no_credentials', { repo });
  return credentials;
}
