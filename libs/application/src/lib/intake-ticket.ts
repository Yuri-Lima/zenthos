import { createRun, type Run } from '@zenthos/domain';
import type { IssueTrackerPort } from '@zenthos/ports';

export type IntakeTicketDeps = { issueTracker: IssueTrackerPort };

/** Use case 1: a ticket key becomes a run in the intake state. */
export async function intakeTicket({ issueTracker }: IntakeTicketDeps, key: string): Promise<Run> {
  const ticket = await issueTracker.getTicket(key);
  return createRun(ticket);
}
