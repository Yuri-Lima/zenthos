import { createConnection, DomainError, withInstallation, withoutInstallation, withRepositories, type ConnectionCheck, type GitHubAppManifestResult, type GitHubCredentials, type Installation, type ProviderConnection, type RepositoryInfo, type WebhookCommand } from '@zenthos/domain';
import type { GitHubAppsPort, ProviderConnectionsPort, RepoProfilesPort, RunControlPort } from '@zenthos/ports';

type ConnectDeps = { connections: ProviderConnectionsPort; githubApps: GitHubAppsPort };

/** Credentials are asked once before they are stored, so a typo fails at the form and not in the middle of a run. */
async function verified(githubApps: GitHubAppsPort, credentials: GitHubCredentials): Promise<string> {
  try {
    return await githubApps.whoAmI(credentials);
  } catch (error) {
    throw new DomainError('invalid_credentials', { reason: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Use case 8: a GitHub App created through the manifest flow becomes a provider connection. The id is
 * chosen before the flow starts so the app's setup URL can carry it back on the install callback.
 */
export async function connectGitHubApp({ connections }: { connections: ProviderConnectionsPort }, result: GitHubAppManifestResult, id?: string, workspaceId?: string): Promise<ProviderConnection> {
  const connection = createConnection(
    {
      provider: 'github',
      name: result.slug,
      credentials: { type: 'github-app', appId: result.appId, privateKey: result.privateKey },
      app: { slug: result.slug, webhookSecret: result.webhookSecret, clientId: result.clientId, clientSecret: result.clientSecret },
      workspaceId,
    },
    id,
  );
  await connections.save(connection);
  return connection;
}

/**
 * An app someone created by hand on GitHub (docs/authentication.md). The webhook works once its secret is
 * given, Sign in with GitHub once its OAuth client id and secret are. Connecting the same app again updates it.
 */
export async function connectExistingGitHubApp(
  { connections, githubApps }: ConnectDeps,
  input: { name: string; appId: string; privateKey: string; webhookSecret?: string; clientId?: string; clientSecret?: string; workspaceId?: string },
): Promise<ProviderConnection> {
  await verified(githubApps, { type: 'github-app', appId: input.appId, privateKey: input.privateKey });
  const existing = await connections.findByAppId(input.appId);
  // An app already held by another workspace is not taken over from here.
  if (existing?.workspaceId && existing.workspaceId !== input.workspaceId) throw new DomainError('forbidden', { reason: 'this GitHub App is connected in another workspace' });
  const app = input.webhookSecret ? { slug: input.name, webhookSecret: input.webhookSecret, clientId: input.clientId, clientSecret: input.clientSecret } : undefined;
  const connection = existing
    ? { ...existing, name: input.name, credentials: { type: 'github-app' as const, appId: input.appId, privateKey: input.privateKey }, app: app ?? existing.app }
    : createConnection({ provider: 'github', name: input.name, credentials: { type: 'github-app', appId: input.appId, privateKey: input.privateKey }, app, workspaceId: input.workspaceId });
  await connections.save(connection);
  return connection;
}

/** A personal token as the interim connection for one account, checked against GitHub before it is stored. */
export async function connectGitHubToken({ connections, githubApps }: ConnectDeps, input: { name: string; token: string; workspaceId?: string }): Promise<ProviderConnection> {
  await verified(githubApps, { type: 'github-token', token: input.token });
  const connection = createConnection({ provider: 'github', name: input.name, credentials: { type: 'github-token', token: input.token }, workspaceId: input.workspaceId });
  await connections.save(connection);
  return connection;
}

/**
 * The health check behind the settings page, never a throw: one authenticated read with the stored credentials,
 * and for an app, its installations refreshed from GitHub and stored. The install redirect and the webhook keep
 * them current when they can reach the API; this catches up when they could not (a laptop without a public URL).
 */
export async function checkConnection({ connections, githubApps }: ConnectDeps, connectionId: string, now = new Date()): Promise<ConnectionCheck> {
  const connection = await connections.get(connectionId);
  if (!connection) throw new DomainError('connection_not_found', { connectionId });
  const checkedAt = now.toISOString();
  try {
    const actsAs = await githubApps.whoAmI(connection.credentials);
    if (connection.credentials.type !== 'github-app') return { ok: true, actsAs, checkedAt };
    const installations = await githubApps.listInstallations(connection.credentials);
    await connections.save({ ...connection, installations });
    return { ok: true, actsAs, repositories: installations.reduce((n, i) => n + i.repositories.length, 0), checkedAt };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error), checkedAt };
  }
}

/** What the profile form needs for a repository the connection can see: its default branch and clone URL. */
export async function describeRepository({ connections, githubApps }: ConnectDeps, connectionId: string, repo: string): Promise<RepositoryInfo> {
  const connection = await connections.get(connectionId);
  if (!connection) throw new DomainError('connection_not_found', { connectionId });
  return githubApps.describeRepository(connection.credentials, repo);
}

/** Use case 9: the install callback or the webhook tells us where the app is now installed. */
export async function recordInstallation({ connections }: { connections: ProviderConnectionsPort }, connectionId: string, installation: Installation): Promise<ProviderConnection> {
  const connection = await connections.get(connectionId);
  if (!connection) throw new DomainError('connection_not_found', { connectionId });
  const updated = withInstallation(connection, installation);
  await connections.save(updated);
  return updated;
}

export type WebhookDeps = { connections: ProviderConnectionsPort; profiles: RepoProfilesPort; runs: RunControlPort };

/**
 * Use case 10: a verified webhook delivery from the app identified by `appId`. Labels drive runs for
 * repositories that have a profile; installation events keep the connection current.
 */
export async function applyWebhookCommand({ connections, profiles, runs }: WebhookDeps, appId: string, command: WebhookCommand): Promise<string> {
  switch (command.kind) {
    case 'start':
    case 'decision': {
      const repo = command.ticketKey.slice(0, command.ticketKey.lastIndexOf('#'));
      if (!(await profiles.get(repo))) return `ignored: no repository profile for ${repo}`;
      if (command.kind === 'start') {
        const { workflowId } = await runs.start(command.ticketKey, command.actor);
        return `started ${workflowId}`;
      }
      await runs.decide(command.ticketKey, command.decision, command.actor);
      return `signalled ${command.decision} to ${command.ticketKey}`;
    }
    case 'installation':
    case 'repositories': {
      const connection = await connections.findByAppId(appId);
      if (!connection) return `ignored: no connection for app ${appId}`;
      const updated =
        command.kind === 'repositories'
          ? withRepositories(connection, command)
          : command.action === 'added'
            ? withInstallation(connection, command.installation)
            : withoutInstallation(connection, command.installation.installationId);
      await connections.save(updated);
      return `connection ${connection.name} now has ${updated.installations.length} installation(s)`;
    }
    case 'ignore':
      return `ignored: ${command.reason}`;
  }
}
