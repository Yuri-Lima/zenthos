import type { ProviderConnection } from '@zenthos/domain';

/** Where provider connections live (ADR 006). Credentials go in and come out whole; the API redacts. */
export interface ProviderConnectionsPort {
  get(id: string): Promise<ProviderConnection | undefined>;
  /** The connection that owns a GitHub App, looked up by the app id the webhook names. */
  findByAppId(appId: string): Promise<ProviderConnection | undefined>;
  /** The app whose OAuth client signs people in (ADR 007), whichever workspace holds it; ADR 019's platform app replaces this. */
  signInApp(): Promise<ProviderConnection | undefined>;
  list(workspaceId: string): Promise<ProviderConnection[]>;
  save(connection: ProviderConnection): Promise<void>;
  remove(id: string): Promise<void>;
}
