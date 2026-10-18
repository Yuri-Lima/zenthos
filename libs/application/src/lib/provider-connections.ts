import { createConnection, DomainError, withInstallation, withoutInstallation, withRepositories, type GitHubAppManifestResult, type Installation, type ProviderConnection, type WebhookCommand } from '@zenthos/domain';
import type { ProviderConnectionsPort, RepoProfilesPort, RunControlPort } from '@zenthos/ports';

/**
 * Use case 8: a GitHub App created through the manifest flow becomes a provider connection. The id is
 * chosen before the flow starts so the app's setup URL can carry it back on the install callback.
 */
export async function connectGitHubApp({ connections }: { connections: ProviderConnectionsPort }, result: GitHubAppManifestResult, id?: string): Promise<ProviderConnection> {
  const connection = createConnection(
    {
      provider: 'github',
      name: result.slug,
      credentials: { type: 'github-app', appId: result.appId, privateKey: result.privateKey },
      app: { slug: result.slug, webhookSecret: result.webhookSecret, clientId: result.clientId, clientSecret: result.clientSecret },
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
  { connections }: { connections: ProviderConnectionsPort },
  input: { name: string; appId: string; privateKey: string; webhookSecret?: string; clientId?: string; clientSecret?: string },
): Promise<ProviderConnection> {
  const existing = await connections.findByAppId(input.appId);
  const app = input.webhookSecret ? { slug: input.name, webhookSecret: input.webhookSecret, clientId: input.clientId, clientSecret: input.clientSecret } : undefined;
  const connection = existing
    ? { ...existing, name: input.name, credentials: { type: 'github-app' as const, appId: input.appId, privateKey: input.privateKey }, app: app ?? existing.app }
    : createConnection({ provider: 'github', name: input.name, credentials: { type: 'github-app', appId: input.appId, privateKey: input.privateKey }, app });
  await connections.save(connection);
  return connection;
}

/** A personal token as the interim connection for one account. */
export async function connectGitHubToken({ connections }: { connections: ProviderConnectionsPort }, name: string, token: string): Promise<ProviderConnection> {
  const connection = createConnection({ provider: 'github', name, credentials: { type: 'github-token', token } });
  await connections.save(connection);
  return connection;
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
