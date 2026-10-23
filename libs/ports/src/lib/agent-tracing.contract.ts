import assert from 'node:assert/strict';
import type { AgentTracingPort } from './agent-tracing.port.js';

const context = { sessionId: 'o/r#1', version: 'coding-agent/v1', name: 'coding agent' };
const usage = { model: 'claude-opus-5-5', tokens: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 100, cacheWriteTokens: 20 }, estimatedCostUsd: 0.01 };

/** Any tracer: the run's value comes back untouched, its error is rethrown, and it always gets an environment. */
export const agentTracingContract: Record<string, (port: AgentTracingPort) => Promise<void>> = {
  'returns what the run returns, rethrows what it throws, and hands it an environment': async (port) => {
    let env: Record<string, string> | undefined;
    const value = await port.traceRun(context, async (exportEnv) => {
      env = exportEnv;
      return { value: 'implemented', usageByModel: [usage] };
    });
    assert.equal(value, 'implemented');
    assert.equal(typeof env, 'object');
    await assert.rejects(
      port.traceRun(context, async () => {
        throw new Error('implementation_failed');
      }),
      /implementation_failed/,
    );
  },
};
