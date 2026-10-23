import { propagateAttributes, startActiveObservation, startObservation } from '@langfuse/tracing';
import type { AgentTraceContext, AgentTracingPort, TracedRun } from '@zenthos/ports';

export type LangfuseExportConfig = { baseUrl: string; publicKey: string; secretKey: string };

/**
 * Traces a coding-agent run into LangFuse (ADR 015). The run executes inside an agent span carrying the ticket's
 * session and the agent's version; the Agent SDK passes the active trace context to Claude Code, so Claude Code's
 * own spans (each turn, model request and tool call) nest inside it, sent straight to LangFuse's OTLP endpoint with
 * the environment below. Claude Code's spans carry no usage LangFuse can price, so when the run returns one
 * generation per model records the tokens the SDK reported, without a cost: LangFuse prices them with its own
 * model table, like the spec writer's and the reviewer's calls, and the cost check stays independent.
 */
export class LangfuseAgentTracing implements AgentTracingPort {
  private readonly exportEnv: Record<string, string>;

  constructor(config: LangfuseExportConfig) {
    const authorization = encodeURIComponent(`Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64')}`);
    this.exportEnv = {
      CLAUDE_CODE_ENABLE_TELEMETRY: '1',
      CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: '1',
      OTEL_TRACES_EXPORTER: 'otlp',
      OTEL_METRICS_EXPORTER: 'none',
      OTEL_LOGS_EXPORTER: 'none',
      OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: 'http/protobuf',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `${config.baseUrl}/api/public/otel/v1/traces`,
      // Without the ingestion-version header LangFuse delays directly ingested OTLP data by up to ten minutes.
      OTEL_EXPORTER_OTLP_TRACES_HEADERS: `Authorization=${authorization},x-langfuse-ingestion-version=4`,
      OTEL_TRACES_EXPORT_INTERVAL: '1000',
      OTEL_SERVICE_NAME: 'zenthos-coding-agent',
      // Claude Code's own session id would claim the trace's session; the run's session is the ticket.
      OTEL_METRICS_INCLUDE_SESSION_ID: 'false',
    };
  }

  traceRun<T>(context: AgentTraceContext, run: (exportEnv: Record<string, string>) => Promise<TracedRun<T>>): Promise<T> {
    return propagateAttributes({ sessionId: context.sessionId, version: context.version, traceName: context.name }, () =>
      startActiveObservation(
        context.name,
        async (agent) => {
          try {
            const { value, usageByModel } = await run(this.exportEnv);
            for (const { model, tokens, cacheWriteOneHourTokens } of usageByModel) {
              startObservation(
                `${context.name} ${model}`,
                {
                  model,
                  version: context.version,
                  // LangFuse prices cache writes per lifetime: `_5m` at 1.25 times input, `_1h` at twice input.
                  usageDetails: {
                    input: tokens.inputTokens,
                    output: tokens.outputTokens,
                    input_cache_read: tokens.cacheReadTokens,
                    input_cache_creation_5m: tokens.cacheWriteTokens - cacheWriteOneHourTokens,
                    input_cache_creation_1h: cacheWriteOneHourTokens,
                  },
                },
                { asType: 'generation' },
              ).end();
            }
            return value;
          } catch (error) {
            agent.update({ level: 'ERROR', statusMessage: error instanceof Error ? error.message : String(error) });
            throw error;
          }
        },
        { asType: 'agent' },
      ),
    );
  }
}
