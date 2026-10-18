import type { Run } from '@zenthos/domain';

/** How anything outside the worker drives a run: the CLI, the API behind the webhook, the dashboard. */
export interface RunControlPort {
  /** Starts the run for a ticket; a second start for a running ticket is a no-op that returns the same id. `actor` is the person, when one asked. */
  start(ticketKey: string, actor?: string): Promise<{ workflowId: string }>;
  decide(ticketKey: string, decision: 'approved' | 'rejected', actor?: string): Promise<void>;
  /** The run as the workflow sees it now; undefined when no run exists for the ticket. */
  state(ticketKey: string): Promise<Run | undefined>;
}
