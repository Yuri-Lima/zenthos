import { roleOfTraceVersion, traceSessionId, type TracedUsageByAgent } from '@zenthos/domain';
import type { TraceUsagePort } from '@zenthos/ports';

export type LangfuseReadConfig = { baseUrl: string; publicKey: string; secretKey: string; projectId: string };

type Observation = { traceId: string; startTime: string };
type MetricsRow = { version: string | null; sum_totalCost: number | null; sum_totalTokens: number | null };

/**
 * Reads a run's usage back from LangFuse v4 (events-only), whose public API has no sessions or traces
 * endpoints. In v4 the session id sits on each trace's root observation, while cost and tokens sit on the
 * generations below it, which carry no session id. So: the root observations of the session give the trace
 * ids, and one metrics query sums cost and tokens over those traces by version, which names the agent.
 */
export class LangfuseTraceUsage implements TraceUsagePort {
  private readonly authorization: string;

  constructor(
    private readonly config: LangfuseReadConfig,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.authorization = `Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64')}`;
  }

  sessionUrl(ticketKey: string): string {
    return `${this.config.baseUrl}/project/${encodeURIComponent(this.config.projectId)}/sessions/${encodeURIComponent(traceSessionId(ticketKey))}`;
  }

  async usageForRun(ticketKey: string): Promise<TracedUsageByAgent> {
    const roots = await this.rootObservations(traceSessionId(ticketKey));
    if (roots.length === 0) return {};
    const traceIds = [...new Set(roots.map((o) => o.traceId))];
    const from = new Date(Math.min(...roots.map((o) => Date.parse(o.startTime))) - 86_400_000).toISOString();
    const rows = await this.get<{ data: MetricsRow[] }>('/api/public/v2/metrics', {
      query: JSON.stringify({
        view: 'observations',
        metrics: [{ measure: 'totalCost', aggregation: 'sum' }, { measure: 'totalTokens', aggregation: 'sum' }],
        dimensions: [{ field: 'version' }],
        filters: [{ column: 'traceId', operator: 'any of', value: traceIds, type: 'stringOptions' }],
        fromTimestamp: from,
        toTimestamp: new Date().toISOString(),
      }),
    });
    const usage: TracedUsageByAgent = {};
    for (const row of rows.data) {
      const agent = row.version ? roleOfTraceVersion(row.version) : undefined;
      if (!agent) continue;
      const before = usage[agent] ?? { estimatedCostUsd: 0, totalTokens: 0 };
      usage[agent] = { estimatedCostUsd: before.estimatedCostUsd + (row.sum_totalCost ?? 0), totalTokens: before.totalTokens + (row.sum_totalTokens ?? 0) };
    }
    return usage;
  }

  /** Every observation LangFuse tags with the session; only the roots carry it, and they are few per run. */
  private async rootObservations(sessionId: string): Promise<Observation[]> {
    const all: Observation[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.get<{ data: Observation[]; meta?: { cursor?: string } }>('/api/public/v2/observations', { sessionId, limit: '100', fields: 'core', ...(cursor ? { cursor } : {}) });
      all.push(...page.data);
      cursor = page.meta?.cursor;
    } while (cursor);
    return all;
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const response = await this.fetchFn(`${this.config.baseUrl}${path}?${new URLSearchParams(params)}`, { headers: { Authorization: this.authorization } });
    if (!response.ok) throw new Error(`LangFuse ${path} answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return (await response.json()) as T;
  }
}
