/**
 * LangGraph Studio entry for the reviewer (`pnpm studio`, graph "reviewer"). Input: `{ "input": { "spec", "diff":
 * { "files", "changedLines", "patch" }, "gates": [], "profile": { "repo", "baseBranch", ... } } }`.
 */
import { buildReviewerGraph } from '../lib/reviewer/graph.js';
import { createAnthropicReviewerModels } from '../lib/reviewer/model.js';

export const graph = buildReviewerGraph(
  createAnthropicReviewerModels({
    model: process.env['ZENTHOS_REVIEW_MODEL'] ?? 'claude-opus-5-5',
  }),
);
