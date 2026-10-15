import Anthropic from '@anthropic-ai/sdk';
import { ChatAnthropic } from '@langchain/anthropic';
import { SpecSchema } from '@zenthos/domain';
import type { StructuredSpecModel } from './graph.js';

/**
 * `apiKey` is optional on purpose. When absent, the Anthropic SDK resolves credentials itself:
 * ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN, then an `ant auth login` profile, then Workload Identity
 * Federation (ANTHROPIC_FEDERATION_RULE_ID + ORGANIZATION_ID + SERVICE_ACCOUNT_ID + IDENTITY_TOKEN_FILE).
 * See docs/authentication.md.
 */
export type SpecModelConfig = { model: string; apiKey?: string };

/**
 * Claude through LangChain, bound to the Spec schema so the output is already the right shape.
 * `jsonSchema` uses Anthropic's native structured outputs; the default (`functionCalling`) forces a
 * tool choice, which Claude Opus 5.5 and Sonnet 5.5 reject with a 400.
 */
export function createAnthropicSpecModel({ model, apiKey }: SpecModelConfig): StructuredSpecModel {
  return new ChatAnthropic({
    model,
    maxTokens: 16_000,
    // LangChain insists on a key unless it is handed a client factory; the SDK then does the resolving.
    createClient: (options) => new Anthropic({ ...options, apiKey }),
  }).withStructuredOutput(SpecSchema, { name: 'spec', method: 'jsonSchema' });
}

/**
 * Boot-time check that costs no tokens: proves the credentials resolve (key, profile or federation)
 * and that the model id exists. Throws the SDK's own error otherwise, so a misconfigured worker
 * fails at start instead of on the first ticket.
 */
export async function verifyAnthropicAccess({ model, apiKey }: SpecModelConfig): Promise<void> {
  await new Anthropic({ apiKey }).models.retrieve(model);
}
