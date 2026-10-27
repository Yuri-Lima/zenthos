import type { ProviderConnection } from '@zenthos/domain';

/** Where provider connections live (ADR 006). Credentials go in and come out whole; the API redacts. */
export interface ProviderConnectionsPort {
  get(id: string): Promise<ProviderConnection | undefined>;
  /** The connection that owns a GitHub App, looked up by the app id the webhook names. */
  findByAppId(appId: string): Promise<ProviderConnection | undefined>;
  /** The operator's one GitHub App (ADR 019): the app connection owned by no workspace. It signs people in and acts on every bound installation. */
  platformApp(): Promise<ProviderConnection | undefined>;
  list(workspaceId: string): Promise<ProviderConnection[]>;
  save(connection: ProviderConnection): Promise<void>;
  remove(id: string): Promise<void>;
}
