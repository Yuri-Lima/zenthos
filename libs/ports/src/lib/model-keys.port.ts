import type { ModelKey } from '@zenthos/domain';

/** Where a workspace's model provider key lives (ADR 019). The key goes in and comes out whole; the API shows only its status. */
export interface ModelKeysPort {
  get(workspaceId: string): Promise<ModelKey | undefined>;
  /** One key per workspace: saving replaces. */
  save(key: ModelKey): Promise<void>;
  remove(workspaceId: string): Promise<void>;
}

/** The model provider's side of a key: proves it works, with a call that costs no tokens. */
export interface ModelProviderPort {
  /** Resolves when the provider accepts the key; rejects with the provider's own error otherwise. */
  verify(key: Pick<ModelKey, 'provider' | 'apiKey'>): Promise<void>;
}
