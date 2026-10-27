import type { ModelKey } from '@zenthos/domain';
import type { ModelKeysPort, ModelProviderPort } from '@zenthos/ports';

/** Keys in a map; for tests and dry runs. */
export class InMemoryModelKeys implements ModelKeysPort {
  private readonly byWorkspace = new Map<string, ModelKey>();

  async get(workspaceId: string): Promise<ModelKey | undefined> {
    return this.byWorkspace.get(workspaceId);
  }

  async save(key: ModelKey): Promise<void> {
    this.byWorkspace.set(key.workspaceId, key);
  }

  async remove(workspaceId: string): Promise<void> {
    this.byWorkspace.delete(workspaceId);
  }
}

/** A key of `rejected` fails, as the provider would answer 401; every other key is accepted. */
export class InMemoryModelProvider implements ModelProviderPort {
  async verify({ apiKey }: Pick<ModelKey, 'provider' | 'apiKey'>): Promise<void> {
    if (apiKey === 'rejected') throw new Error('invalid x-api-key');
  }
}
