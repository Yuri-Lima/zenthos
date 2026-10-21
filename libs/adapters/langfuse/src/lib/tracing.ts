import { CallbackHandler } from '@langfuse/langchain';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

export type LangfuseConfig = { publicKey: string; secretKey: string; baseUrl: string };

export type TraceContext = {
  /** Groups every call of one run. We use the ticket key. */
  sessionId: string;
  /** Prompt or graph version, so regressions can be read per version. */
  version?: string;
  tags?: string[];
};

export type Tracing = {
  /** LangChain callbacks that send this invocation to LangFuse. */
  callbacks(context: TraceContext): CallbackHandler[];
  /** Flushes buffered spans. Call once on shutdown. */
  shutdown(): Promise<void>;
};

/** Registers LangFuse as the OpenTelemetry exporter for the process. Call once at startup. */
export function startLangfuseTracing(config: LangfuseConfig): Tracing {
  const processor = new LangfuseSpanProcessor(config);
  const provider = new NodeTracerProvider({ spanProcessors: [processor] });
  provider.register();
  return {
    callbacks: (context) => [new CallbackHandler(context)],
    shutdown: () => provider.shutdown(),
  };
}

/**
 * LangChain callbacks only, for code that runs under an OpenTelemetry provider someone else registered: the
 * LangFuse experiment action in CI, or the eval command after `startLangfuseTracing`. Registering a second
 * provider would split the spans.
 */
export const langfuseCallbacks: Tracing = {
  callbacks: (context) => [new CallbackHandler(context)],
  shutdown: async () => undefined,
};

/** No-op tracing for tests and runs without LangFuse keys. */
export const noTracing: Tracing = {
  callbacks: () => [],
  shutdown: async () => undefined,
};
