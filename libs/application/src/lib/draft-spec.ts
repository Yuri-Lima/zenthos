import type { Run } from '@zenthos/domain';
import type { IssueTrackerPort, SpecDraft, SpecWriterPort } from '@zenthos/ports';
import { renderSpecComment } from './spec-comment.js';

export type DraftSpecDeps = { specWriter: SpecWriterPort; issueTracker: IssueTrackerPort };

/** Use case 2: draft a spec for the run's ticket and post it where the human will read it; the draft carries what it cost. */
export async function draftSpec(
  { specWriter, issueTracker }: DraftSpecDeps,
  run: Run,
  repoContext: string,
): Promise<SpecDraft> {
  const draft = await specWriter.draftSpec({ ticket: run.ticket, repoContext });
  await issueTracker.postComment(run.ticket.key, renderSpecComment(draft.spec));
  return draft;
}
