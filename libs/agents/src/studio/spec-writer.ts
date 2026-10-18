/**
 * LangGraph Studio entry for the spec writer (`pnpm studio`, graph "spec_writer"). The same graph the
 * worker runs, on Claude through the credentials the Anthropic SDK resolves (docs/authentication.md).
 * Input: `{ "input": { "ticket": { "key", "title", "body", "url", "labels" }, "repoContext": "" }, "attempt": 0 }`.
 */
import { buildSpecWriterGraph } from '../lib/spec-writer/graph.js';
import { createAnthropicSpecModel } from '../lib/spec-writer/model.js';

export const graph = buildSpecWriterGraph(
  createAnthropicSpecModel({
    model: process.env['ZENTHOS_SPEC_MODEL'] ?? 'claude-opus-5-5',
  }),
);
