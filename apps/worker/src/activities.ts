import { Context } from '@temporalio/activity';
import {
  baselineGates,
  draftSpec,
  gateFeedback,
  implementSpec,
  intakeTicket,
  openPullRequest,
  prepareCheckout,
  pushWorkInProgress,
  profileForTicket,
  readApproval,
  reviewChange,
  reviewFeedback,
  runGates,
  type ImplementationResult,
  type ReviewResult,
} from '@zenthos/application';
import type { Approval, GateResult, PullRequest, Review, Run, Checkout } from '@zenthos/domain';
import type { CodingAgentPort, IssueTrackerPort, RepoProfilesPort, ReviewerPort, RunsPort, SandboxPort, ScmPort, SpecDraft, SpecWriterPort } from '@zenthos/ports';

export type ActivityDeps = {
  issueTracker: IssueTrackerPort;
  specWriter: SpecWriterPort;
  sandbox: SandboxPort;
  codingAgent: CodingAgentPort;
  scm: ScmPort;
  reviewer: ReviewerPort;
  repoContext: string;
  profiles: RepoProfilesPort;
  runs: RunsPort;
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
 * Checkout activities share a path on disk, so a run's prepare, baseline, implement, gates and pull
 * request must execute on workers of the same host.
 */
export function createActivities(deps: ActivityDeps) {
  const profile = (run: Run) => profileForTicket(deps.profiles, run.ticket.key);
  return {
    intake: async (key: string): Promise<Run> => intakeTicket(deps, key, await profileForTicket(deps.profiles, key)),
    draftSpec: (run: Run): Promise<SpecDraft> => draftSpec(deps, run, deps.repoContext),
    readApproval: (key: string): Promise<Approval> => readApproval(deps, key),
    prepare: async (run: Run): Promise<Checkout> => prepareCheckout(deps, run, await profile(run)),
    baseline: (run: Run, checkout: Checkout): Promise<string[]> => withHeartbeat(async () => baselineGates(deps, checkout, await profile(run))),
    implement: (run: Run, checkout: Checkout, feedback?: string): Promise<ImplementationResult> =>
      withHeartbeat(async () => implementSpec(deps, run, checkout, await profile(run), feedback)),
    runGates: (run: Run, checkout: Checkout, diff: ImplementationResult['diff'], baselineFailures: string[]): Promise<GateResult[]> =>
      withHeartbeat(async () => runGates(deps, run, checkout, diff, await profile(run), baselineFailures)),
    openPullRequest: async (run: Run, checkout: Checkout, gates: GateResult[]): Promise<PullRequest> =>
      openPullRequest(deps, run, checkout, gates, await profile(run)),
    pushWorkInProgress: (run: Run, checkout: Checkout, gates: GateResult[]): Promise<string> =>
      pushWorkInProgress(deps, run, checkout, gates),
    review: (run: Run): Promise<ReviewResult> => withHeartbeat(async () => reviewChange(deps, run, await profile(run))),
    reviewFeedback: async (review: Review): Promise<string> => reviewFeedback(review),
    cleanup: (checkout: Checkout): Promise<void> => deps.sandbox.cleanup(checkout),
    /** The projection everything outside the workflow reads (ADR 011); called after every state change. */
    recordRun: (run: Run): Promise<void> => deps.runs.save(run),
    /** Pure, but kept beside the activities so the workflow bundle stays free of application code. */
    gateFeedback: async (gates: GateResult[]): Promise<string> => gateFeedback(gates),
  };
}

export type Activities = ReturnType<typeof createActivities>;
