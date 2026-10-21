import assert from 'node:assert/strict';
import { EvalRunResultSchema } from '@zenthos/domain';
import type { EvalResultsPort } from './eval-results.port.js';

/** Any eval store: every run it returns is a valid result with at least one score. */
export const evalResultsContract: Record<string, (port: EvalResultsPort) => Promise<void>> = {
  'returns scored runs that pass the schema, each with a score': async (port) => {
    const runs = await port.scoredRuns();
    assert.ok(runs.length > 0);
    for (const run of runs) {
      assert.ok(EvalRunResultSchema.safeParse(run).success, JSON.stringify(run));
      assert.ok(Object.keys(run.scores).length > 0);
    }
  },
};
