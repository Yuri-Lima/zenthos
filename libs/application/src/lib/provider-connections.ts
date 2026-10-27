import { bindInstallation, coversRepository, createConnection, DomainError, installUrl, sameLogin, unbindInstallation, withInstallation, withoutInstallation, withRepositories, workspaceInstallations, type GitHubAppManifestResult, type GitHubCredentials, type Installation, type PlatformStatus, type ProviderConnection, type RepositoryInfo, type WebhookCommand, type WorkspaceActor } from '@zenthos/domain';
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

/** Whether the operator has set the platform app up, and where it installs: what the dashboard asks before anything else. */
export async function platformStatus({ connections }: { connections: ProviderConnectionsPort }): Promise<PlatformStatus> {
  const app = await connections.platformApp();
  return app ? { configured: true, slug: app.app?.slug, installUrl: installUrl(app) } : { configured: false };
}

type PlatformApp = ProviderConnection & { credentials: Extract<GitHubCredentials, { type: 'github-app' }> };

async function requirePlatformApp(connections: ProviderConnectionsPort): Promise<PlatformApp> {
  const app = await connections.platformApp();
  if (!app || app.credentials.type !== 'github-app') throw new DomainError('platform_not_configured');
  return app as PlatformApp;
}

/**
 * Use case 9: a member claims an installation of the platform app for their workspace (ADR 019). GitHub describes
 * it; the installation must be on the person's own account or on an organisation they belong to, and not already
 * bound to another workspace. `trusted` skips the ownership check: with auth off nobody is identified, and the API is local.
 */
export async function claimInstallation({ connections, githubApps }: ConnectDeps, actor: WorkspaceActor, installationId: number, trusted = false): Promise<Installation> {
  const app = await requirePlatformApp(connections);
  const installation = await githubApps.describeInstallation(app.credentials, installationId).catch((error: { status?: number }) => {
    if (error.status === 404) throw new DomainError('installation_not_found', { installationId });
    throw error;
  });
  const known = app.installations.find((i) => i.installationId === installationId);
  if (known?.workspaceId && known.workspaceId !== actor.workspaceId) throw new DomainError('installation_not_yours', { installationId, reason: 'bound to another workspace' });
  const yours = trusted || sameLogin(installation.account, actor.login) || (await githubApps.isMember(app.credentials, installationId, installation.account, actor.login));
  if (!yours) throw new DomainError('installation_not_yours', { installationId, account: installation.account });
  const bound = { ...installation, workspaceId: actor.workspaceId };
  await connections.save(bindInstallation(app, bound, actor.workspaceId));
  return bound;
}

/** The workspace lets an installation go; the app stays installed on GitHub until its owner removes it there. */
export async function releaseInstallation({ connections }: { connections: ProviderConnectionsPort }, actor: WorkspaceActor, installationId: number): Promise<void> {
  const app = await requirePlatformApp(connections);
  if (!workspaceInstallations(app, actor.workspaceId).some((i) => i.installationId === installationId)) throw new DomainError('installation_not_found', { installationId });
  await connections.save(unbindInstallation(app, installationId));
}

/** The installations a workspace has claimed; none until the platform app exists. */
export async function installationsOf({ connections }: { connections: ProviderConnectionsPort }, workspaceId: string): Promise<Installation[]> {
  const app = await connections.platformApp();
  return app ? workspaceInstallations(app, workspaceId) : [];
}

/** What the profile form needs for a repository one of the workspace's installations covers: its default branch and clone URL. */
export async function describeRepository({ connections, githubApps }: ConnectDeps, workspaceId: string, repo: string): Promise<RepositoryInfo> {
  const app = await requirePlatformApp(connections);
  if (!coversRepository(workspaceInstallations(app, workspaceId), repo)) throw new DomainError('repository_not_found', { repo });
  return githubApps.describeRepository(app.credentials, repo);
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
