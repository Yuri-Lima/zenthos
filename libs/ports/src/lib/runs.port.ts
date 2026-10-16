import type { Run, RunState } from '@zenthos/domain';

/**
 * Where runs are kept once the workflow has moved them (ADR 011). The workflow is the truth while a run is
 * in flight; this is the projection the API, the dashboard and the evals read. One row per run id; a
 * ticket can have several runs over time.
 */
export interface RunsPort {
  save(run: Run): Promise<void>;
  /** The newest run for a ticket. */
  latest(ticketKey: string): Promise<Run | undefined>;
  list(filter?: { state?: RunState; limit?: number }): Promise<Run[]>;
}
