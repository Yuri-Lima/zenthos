import { Context } from '@temporalio/activity';
import {
  baselineGates,
  draftSpec,
  gateFeedback,
  implementSpec,
  intakeTicket,
  openPullRequest,
  prepareWorkspace,
  pushWorkInProgress,
  readApproval,
  reviewChange,
  reviewFeedback,
  runGates,
  type ImplementationResult,
  type ReviewResult,
} from '@zenthos/application';
import { profileForTicket, type Approval, type GateResult, type PullRequest, type RepoProfile, type Review, type Run, type Spec, type Workspace } from '@zenthos/domain';
import type { CodingAgentPort, IssueTrackerPort, ReviewerPort, SandboxPort, ScmPort, SpecWriterPort } from '@zenthos/ports';

export type ActivityDeps = {
  issueTracker: IssueTrackerPort;
  specWriter: SpecWriterPort;
  sandbox: SandboxPort;
  codingAgent: CodingAgentPort;
  scm: ScmPort;
  reviewer: ReviewerPort;
  repoContext: string;
  profiles: RepoProfile[];
};

/**
 * Long activities heartbeat every 30 seconds, so a worker that dies mid-implementation is noticed
 * within the workflow's heartbeat timeout and the attempt is retried on a live worker instead of
 * waiting for the full start-to-close timeout.
 */
async function withHeartbeat<T>(work: () => Promise<T>): Promise<T> {
  const context = Context.current();
  const timer = setInterval(() => context.heartbeat(), 30_000);
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}

/**
 * Activities are thin: each one calls a use case with the adapters the worker was started with.
 * Workspace activities share a path on disk, so a run's prepare, baseline, implement, gates and pull
 * request must execute on workers of the same host.
 */
export function createActivities(deps: ActivityDeps) {
  const profile = (run: Run) => profileForTicket(run.ticket.key, deps.profiles);
  return {
    intake: (key: string): Promise<Run> => intakeTicket(deps, key, profileForTicket(key, deps.profiles)),
    draftSpec: (run: Run): Promise<Spec> => draftSpec(deps, run, deps.repoContext),
    readApproval: (key: string): Promise<Approval> => readApproval(deps, key),
    prepare: (run: Run): Promise<Workspace> => prepareWorkspace(deps, run, profile(run)),
    baseline: (run: Run, workspace: Workspace): Promise<string[]> => withHeartbeat(() => baselineGates(deps, workspace, profile(run))),
    implement: (run: Run, workspace: Workspace, feedback?: string): Promise<ImplementationResult> =>
      withHeartbeat(() => implementSpec(deps, run, workspace, profile(run), feedback)),
    runGates: (run: Run, workspace: Workspace, diff: ImplementationResult['diff'], baselineFailures: string[]): Promise<GateResult[]> =>
      withHeartbeat(() => runGates(deps, run, workspace, diff, profile(run), baselineFailures)),
    openPullRequest: (run: Run, workspace: Workspace, gates: GateResult[]): Promise<PullRequest> =>
      openPullRequest(deps, run, workspace, gates, profile(run)),
    pushWorkInProgress: (run: Run, workspace: Workspace, gates: GateResult[]): Promise<string> =>
      pushWorkInProgress(deps, run, workspace, gates),
    review: (run: Run): Promise<ReviewResult> => withHeartbeat(() => reviewChange(deps, run, profile(run))),
    reviewFeedback: async (review: Review): Promise<string> => reviewFeedback(review),
    cleanup: (workspace: Workspace): Promise<void> => deps.sandbox.cleanup(workspace),
    /** Pure, but kept beside the activities so the workflow bundle stays free of application code. */
    gateFeedback: async (gates: GateResult[]): Promise<string> => gateFeedback(gates),
  };
}

export type Activities = ReturnType<typeof createActivities>;
