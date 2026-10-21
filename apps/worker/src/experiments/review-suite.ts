/**
 * Review suite as a LangFuse experiment (ADR 016), on the history dataset (both agents run) or the runs dataset
 * (the stored spec is reused). Run by the LangFuse experiment action in CI and by `worker:eval -- review` locally.
 */
import type { RunnerContext } from '@langfuse/client';
import { REVIEWER_VERSION } from '@zenthos/agents';
import { fromDatasetItem, reviewExperiment } from '@zenthos/evals';
import { evalDeps, failOnRegression, runGated, selectItems, type GatedRun } from './harness.js';

export async function runReviewSuite(context: RunnerContext): Promise<GatedRun> {
  const [first] = selectItems(context);
  const deps = await evalDeps(fromDatasetItem(first).ticketKey);
  try {
    return await runGated(context, 'review', reviewExperiment(deps, deps.profile, REVIEWER_VERSION), deps.dryRun);
  } finally {
    await deps.close();
  }
}

export async function experiment(context: RunnerContext) {
  return failOnRegression(await runReviewSuite(context));
}
