import type { Run } from '@zenthos/domain';

/** How anything outside the worker drives a run: the CLI, the API behind the webhook, the dashboard. */
export interface RunControlPort {
  /** Starts the run for a ticket; a second start for a running ticket is a no-op that returns the same id. */
  start(ticketKey: string): Promise<{ workflowId: string }>;
  decide(ticketKey: string, decision: 'approved' | 'rejected'): Promise<void>;
  /** The run as the workflow sees it now; undefined when no run exists for the ticket. */
  state(ticketKey: string): Promise<Run | undefined>;
}
