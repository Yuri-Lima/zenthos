import { z } from 'zod';
import { DomainError } from './errors.js';
import type { GitHubCredentials } from './provider.js';

/** The providers a connection can be for. Phase 4 adds GitLab and YouTrack here, and nowhere else. */
export const PROVIDERS = ['github'] as const;
export type Provider = (typeof PROVIDERS)[number];

/** One place the GitHub App is installed: an account, the repositories it may touch, and the workspace it is bound to (ADR 019). */
export const InstallationSchema = z.object({
  installationId: z.number().int().positive(),
  account: z.string().min(1),
  repositories: z.array(z.string().min(1)),
  /** Unbound until a member of a workspace claims it from Settings; the pipeline acts only on bound installations. */
  workspaceId: z.uuid().optional(),
});
export type Installation = z.infer<typeof InstallationSchema>;

/** What GitHub returns when a manifest code is exchanged (ADR 007); everything but the slug and id is a secret. */
export type GitHubAppManifestResult = { appId: string; slug: string; privateKey: string; webhookSecret: string; clientId: string; clientSecret: string };

/** The app half of a connection; every field but the slug is a secret. The OAuth pair exists only for apps the manifest flow created. */
export const GitHubAppSchema = z.object({
  slug: z.string().min(1),
  webhookSecret: z.string().min(1),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
});

const CredentialsSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('github-app'), appId: z.string().min(1), privateKey: z.string().min(1) }),
  z.object({ type: z.literal('github-token'), token: z.string().min(1) }),
]);

/**
 * A provider the product is connected to (ADR 006): the credentials the pipeline acts with, and for a
 * GitHub App, what the webhook and the install flow need. Stores encrypt `credentials` and `app`; the
 * API never returns them.
 */
export const ProviderConnectionSchema = z.object({
  id: z.string().uuid(),
  provider: z.enum(PROVIDERS),
  /** What a person sees in the list: the app slug. */
  name: z.string().min(1),
  credentials: CredentialsSchema,
  app: GitHubAppSchema.optional(),
  installations: z.array(InstallationSchema).default([]),
  /** The workspace that owns the connection (ADR 019); absent only on connections stored before workspaces existed. */
  workspaceId: z.uuid().optional(),
  createdAt: z.string().datetime(),
});

export type ProviderConnection = z.infer<typeof ProviderConnectionSchema> & { credentials: GitHubCredentials };

export function parseConnection(input: unknown): ProviderConnection {
  const result = ProviderConnectionSchema.safeParse(input);
  if (!result.success) throw new DomainError('invalid_connection', { issues: result.error.issues });
  return result.data;
}

/** What the dashboard asks before anything else: whether the operator has set the platform app up, and where it installs. */
export const PlatformStatusSchema = z.object({ configured: z.boolean(), slug: z.string().optional(), installUrl: z.string().optional() });
export type PlatformStatus = z.infer<typeof PlatformStatusSchema>;

/** Whether these installations let the app act on a repository. */
export const coversRepository = (installations: readonly Installation[], repo: string): boolean => installations.some((installation) => installation.repositories.includes(repo));

/** The installations a workspace has claimed, on the platform app (ADR 019). */
export const workspaceInstallations = (connection: Pick<ProviderConnection, 'installations'>, workspaceId: string): Installation[] => connection.installations.filter((i) => i.workspaceId === workspaceId);

export function createConnection(input: Omit<ProviderConnection, 'id' | 'createdAt' | 'installations'> & { installations?: Installation[] }, id: string = globalThis.crypto.randomUUID(), now = new Date()): ProviderConnection {
  return parseConnection({ ...input, id, installations: input.installations ?? [], createdAt: now.toISOString() });
}

/** Records or replaces an installation; the webhook and the install callback both land here. A binding already made stays unless the new record carries one. */
export function withInstallation(connection: ProviderConnection, installation: Installation): ProviderConnection {
  const workspaceId = installation.workspaceId ?? connection.installations.find((i) => i.installationId === installation.installationId)?.workspaceId;
  const kept = { ...installation, ...(workspaceId ? { workspaceId } : {}) };
  return { ...connection, installations: [...connection.installations.filter((i) => i.installationId !== installation.installationId), kept] };
}

/** A member claims an installation for their workspace (ADR 019); the caller has checked it is theirs to claim. */
export function bindInstallation(connection: ProviderConnection, installation: Installation, workspaceId: string): ProviderConnection {
  return withInstallation(connection, { ...installation, workspaceId });
}

export function unbindInstallation(connection: ProviderConnection, installationId: number): ProviderConnection {
  return { ...connection, installations: connection.installations.map((i) => (i.installationId === installationId ? { installationId: i.installationId, account: i.account, repositories: i.repositories } : i)) };
}

/** Applies the delta an `installation_repositories` event carries to what the connection already knows. */
export function withRepositories(connection: ProviderConnection, change: { installationId: number; account: string; added: string[]; removed: string[] }): ProviderConnection {
  const current = connection.installations.find((i) => i.installationId === change.installationId)?.repositories ?? [];
  const repositories = [...new Set([...current.filter((r) => !change.removed.includes(r)), ...change.added])];
  return withInstallation(connection, { installationId: change.installationId, account: change.account, repositories });
}

export function withoutInstallation(connection: ProviderConnection, installationId: number): ProviderConnection {
  return { ...connection, installations: connection.installations.filter((i) => i.installationId !== installationId) };
}

/** The GitHub URL where a person installs the app on more repositories (ADR 007). */
export function installUrl(connection: ProviderConnection): string | undefined {
  return connection.app && `https://github.com/apps/${connection.app.slug}/installations/new`;
}
