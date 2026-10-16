import { z } from 'zod';
import { DomainError } from './errors.js';
import type { GitHubCredentials } from './provider.js';

/** The providers a connection can be for. Phase 4 adds GitLab and YouTrack here, and nowhere else. */
export const PROVIDERS = ['github'] as const;
export type Provider = (typeof PROVIDERS)[number];

/** One place the GitHub App is installed: an account and the repositories it may touch. */
export const InstallationSchema = z.object({
  installationId: z.number().int().positive(),
  account: z.string().min(1),
  repositories: z.array(z.string().min(1)),
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
 * API returns only `redactConnection`.
 */
export const ProviderConnectionSchema = z.object({
  id: z.string().uuid(),
  provider: z.enum(PROVIDERS),
  /** What a person sees in the list: the app slug, or "personal token". */
  name: z.string().min(1),
  credentials: CredentialsSchema,
  app: GitHubAppSchema.optional(),
  installations: z.array(InstallationSchema).default([]),
  createdAt: z.string().datetime(),
});

export type ProviderConnection = z.infer<typeof ProviderConnectionSchema> & { credentials: GitHubCredentials };

export function parseConnection(input: unknown): ProviderConnection {
  const result = ProviderConnectionSchema.safeParse(input);
  if (!result.success) throw new DomainError('invalid_connection', { issues: result.error.issues });
  return result.data;
}

export type PublicConnection = {
  id: string;
  provider: Provider;
  name: string;
  kind: GitHubCredentials['type'];
  appSlug?: string;
  installations: Installation[];
  createdAt: string;
};

/** The view the API serves: no credentials, no app secrets. */
export function redactConnection({ id, provider, name, credentials, app, installations, createdAt }: ProviderConnection): PublicConnection {
  return { id, provider, name, kind: credentials.type, appSlug: app?.slug, installations, createdAt };
}

export function createConnection(input: Omit<ProviderConnection, 'id' | 'createdAt' | 'installations'> & { installations?: Installation[] }, id: string = globalThis.crypto.randomUUID(), now = new Date()): ProviderConnection {
  return parseConnection({ ...input, id, installations: input.installations ?? [], createdAt: now.toISOString() });
}

/** Records or replaces an installation; the webhook and the install callback both land here. */
export function withInstallation(connection: ProviderConnection, installation: Installation): ProviderConnection {
  return { ...connection, installations: [...connection.installations.filter((i) => i.installationId !== installation.installationId), installation] };
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
export const installUrl = (connection: ProviderConnection): string | undefined => connection.app && `https://github.com/apps/${connection.app.slug}/installations/new`;
