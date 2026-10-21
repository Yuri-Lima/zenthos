/**
 * Spec suite as a LangFuse experiment (ADR 016). The LangFuse experiment action runs `experiment` in CI on the
 * history dataset; `pnpm nx run @zenthos/worker:eval -- spec owner/repo` runs `runSpecSuite` locally.
 */
import type { RunnerContext } from '@langfuse/client';
import { SPEC_WRITER_VERSION } from '@zenthos/agents';
import { fromDatasetItem, specExperiment } from '@zenthos/evals';
import { evalDeps, failOnRegression, runGated, selectItems, type GatedRun } from './harness.js';

export async function runSpecSuite(context: RunnerContext): Promise<GatedRun> {
  const [first] = selectItems(context);
  if (first.datasetName?.endsWith('-runs')) throw new Error('the spec suite measures drafted specs against merged history; use the history dataset');
  const deps = await evalDeps(fromDatasetItem(first).ticketKey);
  try {
    return await runGated(context, 'spec', specExperiment(deps, SPEC_WRITER_VERSION), deps.dryRun);
  } finally {
    await deps.close();
  }
}

export async function experiment(context: RunnerContext) {
  return failOnRegression(await runSpecSuite(context));
}
