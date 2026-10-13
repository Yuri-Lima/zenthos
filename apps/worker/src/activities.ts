import { draftSpec, intakeTicket, readApproval } from '@zenthos/application';
import type { Approval, Run, Spec } from '@zenthos/domain';
import type { IssueTrackerPort, SpecWriterPort } from '@zenthos/ports';

export type ActivityDeps = {
  issueTracker: IssueTrackerPort;
  specWriter: SpecWriterPort;
  repoContext: string;
};

/** Activities are thin: each one calls a use case with the adapters the worker was started with. */
export function createActivities(deps: ActivityDeps) {
  return {
    intake: (key: string): Promise<Run> => intakeTicket(deps, key),
    draftSpec: (run: Run): Promise<Spec> => draftSpec(deps, run, deps.repoContext),
    readApproval: (key: string): Promise<Approval> => readApproval(deps, key),
  };
}

export type Activities = ReturnType<typeof createActivities>;
