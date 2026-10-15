import Anthropic from '@anthropic-ai/sdk';
import { ChatAnthropic } from '@langchain/anthropic';
import { FindingSchema, RubricScoreSchema } from '@zenthos/domain';
import { z } from 'zod';
import type { ReviewerModels } from './graph.js';

/** The findings pass returns the list and the summary together; the scores come from the parallel pass. */
export const FindingsSchema = z.object({ findings: z.array(FindingSchema), summary: z.string().min(10) });

export type ReviewerModelConfig = { model: string; apiKey?: string };

/** Claude through LangChain, one binding per output schema (native structured outputs, see ADR 004). */
export function createAnthropicReviewerModels({ model, apiKey }: ReviewerModelConfig): ReviewerModels {
  const chat = new ChatAnthropic({ model, maxTokens: 8_000, createClient: (options) => new Anthropic({ ...options, apiKey }) });
  return {
    score: chat.withStructuredOutput(RubricScoreSchema, { name: 'rubric_score', method: 'jsonSchema' }),
    findings: chat.withStructuredOutput(FindingsSchema, { name: 'findings', method: 'jsonSchema' }),
  };
}
