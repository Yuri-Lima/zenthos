import type { AgentTracingPort, AgentTraceContext, TracedRun } from '@zenthos/ports';

/** Runs the agent with no tracing: an empty environment, nothing recorded. For dry runs and tests. */
export class NoAgentTracing implements AgentTracingPort {
  async traceRun<T>(_context: AgentTraceContext, run: (exportEnv: Record<string, string>) => Promise<TracedRun<T>>): Promise<T> {
    return (await run({})).value;
  }
}
