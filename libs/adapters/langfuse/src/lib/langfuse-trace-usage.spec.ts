import { traceUsageContract } from '@zenthos/ports';
import { LangfuseTraceUsage } from './langfuse-trace-usage.js';

/** Answers the two LangFuse v4 calls the adapter makes, the way the live server does for run 300. */
function fakeLangfuse() {
  const calls: URL[] = [];
  const fetchFn = (async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url.pathname === '/api/public/v2/observations') {
      if (url.searchParams.get('sessionId') !== 'o/r#300') return json({ data: [], meta: {} });
      return url.searchParams.get('cursor')
        ? json({ data: [{ traceId: 't2', startTime: '2026-10-15T11:37:44.228Z' }], meta: {} })
        : json({ data: [{ traceId: 't1', startTime: '2026-10-18T09:52:52.540Z' }, { traceId: 't1', startTime: '2026-10-18T09:52:53.000Z' }], meta: { cursor: 'next' } });
    }
    if (url.pathname === '/api/public/v2/metrics') {
      return json({ data: [{ version: 'reviewer/v1', sum_totalCost: 0.715, sum_totalTokens: 119938 }, { version: 'spec-writer/v1', sum_totalCost: 0.56, sum_totalTokens: 79220 }, { version: null, sum_totalCost: 0, sum_totalTokens: 0 }] });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetchFn, calls };
}

const config = { baseUrl: 'http://lf.test', publicKey: 'pk', secretKey: 'sk', projectId: 'zenthos-dev' };

describe('LangfuseTraceUsage', () => {
  for (const [name, check] of Object.entries(traceUsageContract)) it(name, () => check(new LangfuseTraceUsage(config, fakeLangfuse().fetchFn), { tracedTicket: 'o/r#300', untracedTicket: 'o/r#1' }));

  it('joins the session to its traces across pages, sums cost by agent version, and links the session page', async () => {
    const { fetchFn, calls } = fakeLangfuse();
    const port = new LangfuseTraceUsage(config, fetchFn);
    expect(await port.usageForRun('o/r#300')).toEqual({ reviewer: { estimatedCostUsd: 0.715, totalTokens: 119938 }, spec_writer: { estimatedCostUsd: 0.56, totalTokens: 79220 } });
    const metricsCall = calls.find((c) => c.pathname.endsWith('/metrics'));
    const query = JSON.parse(metricsCall?.searchParams.get('query') ?? '{}');
    expect(query.filters[0]).toEqual({ column: 'traceId', operator: 'any of', value: ['t1', 't2'], type: 'stringOptions' });
    expect(query.fromTimestamp).toBe('2026-10-14T11:37:44.228Z');
    expect(port.sessionUrl('o/r#300')).toBe('http://lf.test/project/zenthos-dev/sessions/o%2Fr%23300');
  });

  it('says what LangFuse answered when a call fails', async () => {
    const port = new LangfuseTraceUsage(config, (async () => new Response('Invalid credentials', { status: 401 })) as typeof fetch);
    await expect(port.usageForRun('o/r#300')).rejects.toThrow('answered 401: Invalid credentials');
  });
});
