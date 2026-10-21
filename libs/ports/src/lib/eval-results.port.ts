import type { EvalRunResult } from '@zenthos/domain';

/** The scored eval runs, read back from where the experiments ran (ADR 016). Read-only: the experiments write them. */
export interface EvalResultsPort {
  /** Every recent scored run, one entry per experiment run; the domain picks the latest per suite. */
  scoredRuns(): Promise<EvalRunResult[]>;
}
