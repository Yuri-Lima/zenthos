import type { EvalRunResult } from '@zenthos/domain';
import type { EvalResultsPort } from '@zenthos/ports';

export class InMemoryEvalResults implements EvalResultsPort {
  constructor(private readonly runs: EvalRunResult[] = []) {}

  async scoredRuns(): Promise<EvalRunResult[]> {
    return this.runs;
  }
}
