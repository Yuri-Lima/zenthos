import { z } from 'zod';

/** The model providers a workspace can bring its own key for; the next one is added here and nowhere else. */
export const MODEL_PROVIDERS = ['anthropic'] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

/**
 * A workspace's own key to a model provider (ADR 019): entered in Settings, checked with the provider, sealed at
 * rest, and used by every agent of the workspace's runs. The invoice is the workspace's, not the operator's.
 */
export const ModelKeySchema = z.object({
  workspaceId: z.uuid(),
  provider: z.enum(MODEL_PROVIDERS),
  apiKey: z.string().min(8),
  createdAt: z.iso.datetime(),
});
export type ModelKey = z.infer<typeof ModelKeySchema>;

/** What the API shows about a workspace's key: never the key, only enough to tell which one it is. */
export const ModelKeyStatusSchema = z.object({
  configured: z.boolean(),
  provider: z.enum(MODEL_PROVIDERS).optional(),
  last4: z.string().optional(),
  createdAt: z.iso.datetime().optional(),
});
export type ModelKeyStatus = z.infer<typeof ModelKeyStatusSchema>;

export const modelKeyStatus = (key?: ModelKey): ModelKeyStatus =>
  key ? { configured: true, provider: key.provider, last4: key.apiKey.slice(-4), createdAt: key.createdAt } : { configured: false };
