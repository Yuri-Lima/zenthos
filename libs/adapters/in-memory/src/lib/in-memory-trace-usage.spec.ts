import { traceUsageContract } from '@zenthos/ports';
import { InMemoryTraceUsage } from './in-memory-trace-usage.js';

describe('InMemoryTraceUsage', () => {
  const port = new InMemoryTraceUsage({ 'o/r#1': { reviewer: { estimatedCostUsd: 0.7, totalTokens: 120_000 } } });
  for (const [name, check] of Object.entries(traceUsageContract)) it(name, () => check(port, { tracedTicket: 'o/r#1', untracedTicket: 'o/r#2' }));
});
