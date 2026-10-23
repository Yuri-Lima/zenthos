import { LangfuseSpanProcessor } from '@langfuse/otel';
import { trace } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { agentTracingContract } from '@zenthos/ports';
import { LangfuseAgentTracing } from './langfuse-agent-tracing.js';

const config = { baseUrl: 'https://langfuse.example.test', publicKey: 'pk-lf-test', secretKey: 'sk-lf-test' };
// LangFuse's own processor, as in production (it copies the propagated session and version onto each span), with
// an in-memory exporter in place of the network.
const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({ spanProcessors: [new LangfuseSpanProcessor({ ...config, exporter, exportMode: 'immediate' })] });
const context = { sessionId: 'owner/repo#4', version: 'coding-agent/v1', name: 'coding agent' };
const usage = { model: 'claude-opus-5-5', tokens: { inputTokens: 100, outputTokens: 200, cacheReadTokens: 3000, cacheWriteTokens: 400 }, cacheWriteOneHourTokens: 300, estimatedCostUsd: 1.4 };

describe('LangfuseAgentTracing', () => {
  beforeAll(() => provider.register());
  afterAll(async () => {
    await provider.shutdown();
    trace.disable();
  });
  beforeEach(() => exporter.reset());
  const finished = async () => {
    await provider.forceFlush();
    return exporter.getFinishedSpans();
  };

  for (const [name, check] of Object.entries(agentTracingContract)) it(name, () => check(new LangfuseAgentTracing(config)));

  it('runs inside an agent span with the session and version, and records a generation per model for LangFuse to price', async () => {
    let activeTraceId: string | undefined;
    let env: Record<string, string> = {};
    await new LangfuseAgentTracing(config).traceRun(context, async (exportEnv) => {
      env = exportEnv;
      activeTraceId = trace.getActiveSpan()?.spanContext().traceId;
      return { value: 'done', usageByModel: [usage] };
    });
    const spans = await finished();
    const agent = spans.find((s) => s.name === 'coding agent');
    const generation = spans.find((s) => s.name === 'coding agent claude-opus-5-5');
    expect(agent?.spanContext().traceId).toBe(activeTraceId);
    expect(generation?.spanContext().traceId).toBe(activeTraceId);
    const values = (span: typeof agent) => Object.values(span?.attributes ?? {}).map(String);
    expect(values(agent)).toEqual(expect.arrayContaining(['owner/repo#4', 'coding-agent/v1', 'agent']));
    expect(values(generation)).toEqual(expect.arrayContaining(['claude-opus-5-5', 'coding-agent/v1', 'generation']));
    const usageDetails = JSON.parse(values(generation).find((v) => v.includes('input_cache_read')) ?? '{}');
    expect(usageDetails).toEqual({ input: 100, output: 200, input_cache_read: 3000, input_cache_creation_5m: 100, input_cache_creation_1h: 300 });
    expect(values(generation).some((v) => v.includes('cost'))).toBe(false);
    expect(env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT']).toBe('https://langfuse.example.test/api/public/otel/v1/traces');
    expect(decodeURIComponent(env['OTEL_EXPORTER_OTLP_TRACES_HEADERS'])).toBe(`Authorization=Basic ${Buffer.from('pk-lf-test:sk-lf-test').toString('base64')},x-langfuse-ingestion-version=4`);
  });

  it('marks the agent span as an error when the run fails', async () => {
    await expect(new LangfuseAgentTracing(config).traceRun(context, async () => Promise.reject(new Error('implementation_failed')))).rejects.toThrow('implementation_failed');
    const agent = (await finished()).find((s) => s.name === 'coding agent');
    expect(Object.values(agent?.attributes ?? {}).map(String)).toEqual(expect.arrayContaining(['ERROR', 'implementation_failed']));
  });
});
