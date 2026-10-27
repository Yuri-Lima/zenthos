import { assertCan, DomainError, modelKeyStatus, type ModelKey, type ModelKeyStatus, type WorkspaceActor } from '@zenthos/domain';
import type { ModelKeysPort, ModelProviderPort } from '@zenthos/ports';

export type ModelKeyDeps = { modelKeys: ModelKeysPort; modelProvider: ModelProviderPort };

/** Whether the workspace has a model key, and which one, without the key itself. */
export async function modelKeyStatusOf({ modelKeys }: Pick<ModelKeyDeps, 'modelKeys'>, workspaceId: string): Promise<ModelKeyStatus> {
  return modelKeyStatus(await modelKeys.get(workspaceId));
}

/**
 * Use case 16: an owner or admin enters the workspace's model key (ADR 019). The provider is asked first, so a typo
 * fails at the form and not in the middle of a run; the key is then stored sealed and replaces the previous one.
 */
export async function setModelKey({ modelKeys, modelProvider }: ModelKeyDeps, actor: WorkspaceActor, apiKey: string, now = new Date()): Promise<ModelKeyStatus> {
  assertCan(actor.role, 'configure');
  const key: ModelKey = { workspaceId: actor.workspaceId, provider: 'anthropic', apiKey, createdAt: now.toISOString() };
  try {
    await modelProvider.verify(key);
  } catch (error) {
    throw new DomainError('model_key_invalid', { reason: error instanceof Error ? error.message : String(error) });
  }
  await modelKeys.save(key);
  return modelKeyStatus(key);
}

/** The workspace's runs fall back to the operator's credentials, if any, until a key is entered again. */
export async function removeModelKey({ modelKeys }: Pick<ModelKeyDeps, 'modelKeys'>, actor: WorkspaceActor): Promise<void> {
  assertCan(actor.role, 'configure');
  await modelKeys.remove(actor.workspaceId);
}
