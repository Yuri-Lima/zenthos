import { approvalFromLabels, type Approval } from '@zenthos/domain';
import type { IssueTrackerPort } from '@zenthos/ports';

/** Use case 3: what has the human decided about the spec, read from the ticket's labels. */
export async function readApproval({ issueTracker }: { issueTracker: IssueTrackerPort }, key: string): Promise<Approval> {
  const ticket = await issueTracker.getTicket(key);
  return approvalFromLabels(ticket.labels);
}
