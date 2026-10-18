import type { TracedUsageByAgent } from '@zenthos/domain';

/**
 * What the tracing backend recorded for a run (ADR 015). Read-only: ZenthOs writes traces through LangChain
 * callbacks, and reads them back only to check its own numbers against them.
 */
export interface TraceUsagePort {
  /** Cost and tokens per traced agent for the run of this ticket; an agent with no recorded calls is absent. */
  usageForRun(ticketKey: string): Promise<TracedUsageByAgent>;
  /** Where a person reads every call of that run. */
  sessionUrl(ticketKey: string): string;
}
