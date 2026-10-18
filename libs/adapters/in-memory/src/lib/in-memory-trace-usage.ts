import type { TracedUsageByAgent } from '@zenthos/domain';
import type { TraceUsagePort } from '@zenthos/ports';

/** Answers from a map of ticket key to what a tracing backend would have recorded. */
export class InMemoryTraceUsage implements TraceUsagePort {
  constructor(private readonly byTicket: Record<string, TracedUsageByAgent> = {}) {}

  async usageForRun(ticketKey: string): Promise<TracedUsageByAgent> {
    return this.byTicket[ticketKey] ?? {};
  }

  sessionUrl(ticketKey: string): string {
    return `memory://traces/${encodeURIComponent(ticketKey)}`;
  }
}
