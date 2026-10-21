import { evalResultsContract } from '@zenthos/ports';
import { LangfuseEvalResults } from './langfuse-eval-results.js';

const config = { baseUrl: 'http://lf.test', publicKey: 'pk', secretKey: 'sk', projectId: 'zenthos-dev' };
const stamp = { suite: 'spec', promptVersion: 'spec-writer/v1', dataset: 'o-r' };

/** Answers the v3 scores endpoint the way LangFuse v4 does for run-level scores. */
function fakeLangfuse() {
  const asked: string[] = [];
  const fetchFn = (async (input: string | URL) => {
    const url = new URL(String(input));
    const name = url.searchParams.get('name') ?? '';
    asked.push(`${url.pathname}?${url.searchParams.get('fields')}:${name}`);
    const data =
      name === 'mean_touched_area_recall'
        ? [
            { name, value: 0.4, timestamp: '2026-10-18T10:00:00.000Z', metadata: stamp, subject: { kind: 'experiment', id: 'run-1' } },
            { name, value: 0, timestamp: '2026-10-21T08:59:18.829Z', metadata: {}, subject: { kind: 'experiment', id: 'run-0' } },
            { name, value: 0, timestamp: '2026-10-21T09:05:00.965Z', metadata: { ...stamp, dryRun: true }, subject: { kind: 'experiment', id: 'run-dry' } },
          ]
        : name === 'mean_criteria_per_spec'
          ? [{ name, value: 4.6, timestamp: '2026-10-18T10:00:00.000Z', metadata: stamp, subject: { kind: 'experiment', id: 'run-1' } }]
          : [];
    return new Response(JSON.stringify({ data, meta: { limit: 100 } }), { status: 200 });
  }) as typeof fetch;
  return { fetchFn, asked };
}

describe('LangfuseEvalResults', () => {
  for (const [name, check] of Object.entries(evalResultsContract)) it(name, () => check(new LangfuseEvalResults(config, fakeLangfuse().fetchFn)));

  it('groups the run-level scores by experiment run and skips unstamped scores and dry runs', async () => {
    const { fetchFn, asked } = fakeLangfuse();
    expect(await new LangfuseEvalResults(config, fetchFn).scoredRuns()).toEqual([
      { suite: 'spec', dataset: 'o-r', promptVersion: 'spec-writer/v1', runName: 'run-1', createdAt: '2026-10-18T10:00:00.000Z', scores: { touched_area_recall: 0.4, criteria_per_spec: 4.6 } },
    ]);
    expect(asked[0]).toBe('/api/public/v3/scores?core,details,subject:mean_touched_area_recall');
  });
});
