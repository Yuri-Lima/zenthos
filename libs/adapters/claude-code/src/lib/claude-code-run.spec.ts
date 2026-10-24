import { repoProfile, type Spec, type Checkout } from '@zenthos/domain';
import type { AgentTracingPort } from '@zenthos/ports';

const messages: unknown[] = [];
const seenOptions: { env?: Record<string, string | undefined> }[] = [];
const sentPrompts: unknown[][] = [];
const organisation = { email: 'ops@example.com', organization: 'Example Org', apiProvider: 'firstParty' };
let account: Record<string, unknown> = organisation;
// Like the real SDK: the session reads the prompt stream, answers accountInfo(), and ends without output when no message was sent.
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: ({ prompt, options }: { prompt: AsyncIterable<unknown>; options: { env?: Record<string, string | undefined> } }) => {
    seenOptions.push(options);
    const sent: unknown[] = [];
    sentPrompts.push(sent);
    return {
      accountInfo: async () => account,
      async *[Symbol.asyncIterator]() {
        for await (const message of prompt) sent.push(message);
        if (sent.length) yield* messages;
      },
    };
  },
}));

// Imported after the mock so the adapter sees the fake SDK.
import { asResult, ClaudeCodeAgent } from './claude-code-agent.js';

const configDir = '/home/ops/.zenthos/claude-code';
const agent = (options: { tracing?: AgentTracingPort } = {}) => new ClaudeCodeAgent({ configDir, ...options });
beforeEach(() => {
  account = organisation;
  messages.length = 0;
});

const profile = repoProfile({ repo: 'owner/repo', cloneUrl: 'x', baseBranch: 'main', allowedCommands: [], gateCommands: [] });
const spec: Spec = { ticketKey: 'owner/repo#4', problem: 'Partners cannot export the list', inScope: ['it'], outOfScope: [], acceptanceCriteria: [{ id: 'AC-1', statement: 'It exports a CSV file', testHint: 'jest' }], touchedAreas: ['src/'], risks: [] };
const checkout: Checkout = { id: 'w', path: '/tmp/w', repo: 'owner/repo', baseBranch: 'main', branch: 'zenthos/owner-repo-4' };

const result = {
  type: 'result',
  subtype: 'success',
  result: 'Added the export',
  total_cost_usd: 1.5,
  usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 300, cache_creation: { ephemeral_1h_input_tokens: 300, ephemeral_5m_input_tokens: 0 } },
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
    // The main loop's one-hour writes go to the model with the most cache writes when the session model is unknown.
    expect(parsed?.usageByModel.map((u) => u.cacheWriteOneHourTokens)).toEqual([300, 0]);
    expect(asResult(result as never, 'claude-haiku-5-5[1m]')?.usageByModel.map((u) => u.cacheWriteOneHourTokens)).toEqual([0, 0]);
    const loopOnly: Partial<typeof result> = { ...result };
    delete loopOnly.modelUsage;
    expect(asResult(loopOnly as never)?.tokens).toEqual({ inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 300 });
  });
});

describe('ClaudeCodeAgent tracing', () => {
  it('runs inside the tracer with the ticket session and version, and gives Claude Code the export environment', async () => {
    messages.push({ type: 'assistant' }, result);
    const traced: { context: unknown; usage: unknown }[] = [];
    const tracing: AgentTracingPort = {
      traceRun: async (context, run) => {
        const { value, usageByModel } = await run({ OTEL_TRACES_EXPORTER: 'otlp' });
        traced.push({ context, usage: usageByModel.map((u) => u.model) });
        return value;
      },
    };
    const implementation = await agent({ tracing }).implement({ checkout, spec, profile });
    expect(implementation).toEqual({ summary: 'Added the export', estimatedCostUsd: 1.5, tokens: { inputTokens: 150, outputTokens: 210, cacheReadTokens: 3000, cacheWriteTokens: 400 } });
    expect(traced).toEqual([{ context: { sessionId: 'owner/repo#4', version: 'coding-agent/v1', name: 'coding agent' }, usage: ['claude-opus-5-5', 'claude-haiku-5-5'] }]);
    expect(seenOptions.at(-1)?.env?.['OTEL_TRACES_EXPORTER']).toBe('otlp');
    expect(seenOptions.at(-1)?.env?.['PATH']).toBe(process.env['PATH']);
  });

  it('fails when a success result carries is_error, as an expired login does, instead of reporting it as done', async () => {
    messages.push({ type: 'result', subtype: 'success', is_error: true, result: 'Failed to authenticate: OAuth session expired and could not be refreshed', total_cost_usd: 0, modelUsage: {} });
    await expect(agent().implement({ checkout, spec, profile })).rejects.toMatchObject({ code: 'implementation_failed', context: { reason: expect.stringContaining('api_error: Failed to authenticate') } });
  });

  it('fails with the cost of the failed run attached', async () => {
    messages.push({ ...result, subtype: 'error_max_turns' });
    await expect(agent().implement({ checkout, spec, profile })).rejects.toMatchObject({ code: 'implementation_failed', context: { reason: 'error_max_turns', estimatedCostUsd: 1.5 } });
  });
});

describe('ClaudeCodeAgent credentials (ADR 018)', () => {
  it('runs Claude Code in its own config directory, without a subscription token from the environment', async () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-test';
    try {
      messages.push(result);
      await agent().implement({ checkout, spec, profile });
      expect(seenOptions.at(-1)?.env).toMatchObject({ CLAUDE_CONFIG_DIR: configDir, PATH: process.env['PATH'] });
      expect(seenOptions.at(-1)?.env).not.toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN');
    } finally {
      delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    }
  });

  it('refuses a claude.ai subscription before the prompt reaches the model', async () => {
    account = { email: 'me@example.com', organization: 'Personal', subscriptionType: 'Claude Max', apiProvider: 'firstParty' };
    messages.push(result);
    await expect(agent().implement({ checkout, spec, profile })).rejects.toMatchObject({ code: 'implementation_failed', context: { reason: expect.stringContaining('credential_refused: it is signed in to a claude.ai subscription') } });
    expect(sentPrompts.at(-1)).toEqual([]);
  });

  it('sends the prompt once the account is an organisation one', async () => {
    messages.push(result);
    await agent().implement({ checkout, spec, profile });
    expect(sentPrompts.at(-1)).toEqual([{ type: 'user', message: { role: 'user', content: expect.stringContaining('AC-1') }, parent_tool_use_id: null }]);
  });

  it('checks access at boot without sending anything', async () => {
    await expect(agent().verifyAccess()).resolves.toBeUndefined();
    expect(sentPrompts.at(-1)).toEqual([]);
    account = { subscriptionType: 'Claude Pro', email: 'me@example.com' };
    await expect(agent().verifyAccess()).rejects.toThrow('claude.ai subscription (Claude Pro)');
  });
});
