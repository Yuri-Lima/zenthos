import type { Run, Spec } from '@zenthos/domain';
import type { IssueTrackerPort, SpecWriterPort } from '@zenthos/ports';
import { renderSpecComment } from './spec-comment.js';

export type DraftSpecDeps = { specWriter: SpecWriterPort; issueTracker: IssueTrackerPort };

/** Use case 2: draft a spec for the run's ticket and post it where the human will read it. */
export async function draftSpec(
  { specWriter, issueTracker }: DraftSpecDeps,
  run: Run,
  repoContext: string,
): Promise<Spec> {
  const spec = await specWriter.draftSpec({ ticket: run.ticket, repoContext });
  await issueTracker.postComment(run.ticket.key, renderSpecComment(spec));
  return spec;
}
