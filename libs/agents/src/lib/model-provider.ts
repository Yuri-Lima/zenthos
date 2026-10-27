import Anthropic from '@anthropic-ai/sdk';
import type { ModelKey } from '@zenthos/domain';
import type { ModelProviderPort } from '@zenthos/ports';

/** Proves a workspace's key at Anthropic with a call that costs no tokens; the SDK's own error says why it fails. */
export class AnthropicModelProvider implements ModelProviderPort {
  async verify({ apiKey }: Pick<ModelKey, 'provider' | 'apiKey'>): Promise<void> {
    await new Anthropic({ apiKey }).models.list({ limit: 1 });
  }
}
