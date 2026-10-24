import { createRun, type RepoProfile, type Run } from '@zenthos/domain';
import type { IssueTrackerPort } from '@zenthos/ports';

export type IntakeTicketDeps = { issueTracker: IssueTrackerPort };

/** Use case 1: a ticket key becomes a run in the intake state, carrying its repository's policy. */
export async function intakeTicket({ issueTracker }: IntakeTicketDeps, key: string, profile: RepoProfile): Promise<Run> {
  const ticket = await issueTracker.getTicket(key);
  return createRun(ticket, { policy: profile.policy, workspaceId: profile.workspaceId });
}
