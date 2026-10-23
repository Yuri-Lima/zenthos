import { repoProfile, type Spec, type Workspace } from '@zenthos/domain';
import type { AgentTracingPort } from '@zenthos/ports';

const messages: unknown[] = [];
const seenOptions: { env?: Record<string, string> }[] = [];
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: ({ options }: { options: { env?: Record<string, string> } }) => {
    seenOptions.push(options);
    return (async function* () {
      yield* messages;
    })();
  },
}));

// Imported after the mock so the adapter sees the fake SDK.
import { asResult, ClaudeCodeAgent } from './claude-code-agent.js';

const profile = repoProfile({ repo: 'owner/repo', cloneUrl: 'x', baseBranch: 'main', allowedCommands: [], gateCommands: [] });
const spec: Spec = { ticketKey: 'owner/repo#4', problem: 'Partners cannot export the list', inScope: ['it'], outOfScope: [], acceptanceCriteria: [{ id: 'AC-1', statement: 'It exports a CSV file', testHint: 'jest' }], touchedAreas: ['src/'], risks: [] };
const workspace: Workspace = { id: 'w', path: '/tmp/w', repo: 'owner/repo', baseBranch: 'main', branch: 'zenthos/owner-repo-4' };

const result = {
  type: 'result',
  subtype: 'success',
  result: 'Added the export',
  total_cost_usd: 1.5,
  usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  modelUsage: {
    'claude-opus-5-5': { inputTokens: 100, outputTokens: 200, cacheReadInputTokens: 3000, cacheCreationInputTokens: 400, costUSD: 1.4 },
    'claude-haiku-5-5[1m]': { inputTokens: 50, outputTokens: 10, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0.1, canonicalModel: 'claude-haiku-5-5' },
  },
};

describe('asResult', () => {
  it('takes tokens and cost per model from modelUsage, and the loop usage only when modelUsage is missing', () => {
    const parsed = asResult(result as never);
    expect(parsed?.tokens).toEqual({ inputTokens: 150, outputTokens: 210, cacheReadTokens: 3000, cacheWriteTokens: 400 });
    expect(parsed?.usageByModel.map((u) => [u.model, u.estimatedCostUsd])).toEqual([['claude-opus-5-5', 1.4], ['claude-haiku-5-5', 0.1]]);
    const loopOnly: Partial<typeof result> = { ...result };
    delete loopOnly.modelUsage;
    expect(asResult(loopOnly as never)?.tokens).toEqual({ inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 });
  });
});

describe('ClaudeCodeAgent tracing', () => {
  it('runs inside the tracer with the ticket session and version, and gives Claude Code the export environment', async () => {
    messages.length = 0;
    messages.push({ type: 'assistant' }, result);
    const traced: { context: unknown; usage: unknown }[] = [];
    const tracing: AgentTracingPort = {
      traceRun: async (context, run) => {
        const { value, usageByModel } = await run({ OTEL_TRACES_EXPORTER: 'otlp' });
        traced.push({ context, usage: usageByModel.map((u) => u.model) });
        return value;
      },
    };
    const implementation = await new ClaudeCodeAgent({ tracing }).implement({ workspace, spec, profile });
    expect(implementation).toEqual({ summary: 'Added the export', estimatedCostUsd: 1.5, tokens: { inputTokens: 150, outputTokens: 210, cacheReadTokens: 3000, cacheWriteTokens: 400 } });
    expect(traced).toEqual([{ context: { sessionId: 'owner/repo#4', version: 'coding-agent/v1', name: 'coding agent' }, usage: ['claude-opus-5-5', 'claude-haiku-5-5'] }]);
    expect(seenOptions.at(-1)?.env?.['OTEL_TRACES_EXPORTER']).toBe('otlp');
    expect(seenOptions.at(-1)?.env?.['PATH']).toBe(process.env['PATH']);
  });

  it('leaves the inherited environment alone when nothing traces the run', async () => {
    messages.length = 0;
    messages.push(result);
    await new ClaudeCodeAgent().implement({ workspace, spec, profile });
    expect(seenOptions.at(-1)?.env).toBeUndefined();
  });

  it('fails when a success result carries is_error, as an expired login does, instead of reporting it as done', async () => {
    messages.length = 0;
    messages.push({ type: 'result', subtype: 'success', is_error: true, result: 'Failed to authenticate: OAuth session expired and could not be refreshed', total_cost_usd: 0, modelUsage: {} });
    await expect(new ClaudeCodeAgent().implement({ workspace, spec, profile })).rejects.toMatchObject({ code: 'implementation_failed', context: { reason: expect.stringContaining('api_error: Failed to authenticate') } });
  });

  it('fails with the cost of the failed run attached', async () => {
    messages.length = 0;
    messages.push({ ...result, subtype: 'error_max_turns' });
    await expect(new ClaudeCodeAgent().implement({ workspace, spec, profile })).rejects.toMatchObject({ code: 'implementation_failed', context: { reason: 'error_max_turns', estimatedCostUsd: 1.5 } });
  });
});
