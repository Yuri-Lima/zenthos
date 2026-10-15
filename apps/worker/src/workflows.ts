import { condition, defineQuery, defineSignal, proxyActivities, setHandler } from '@temporalio/workflow';
import { addTokens, applyEvent, canRetryAfter, DEFAULT_APPROVAL_POLICY, WORKFLOW_CONTRACT, type Approval, type ApprovalPolicy, type Run, type RunEvent } from '@zenthos/domain';
import type { Activities } from './activities.js';

const activities = proxyActivities<Activities>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 3 },
});

/**
 * The coding agent and the gates run for a long time. They heartbeat every 30 seconds, so a dead
 * worker is noticed within 2 minutes and the attempt moves to a live worker; both activities start
 * from a fresh clone, so one retry is safe. A model or gate failure inside the attempt is a result,
 * not an exception, and is never retried here.
 */
const longActivities = proxyActivities<Pick<Activities, 'baseline' | 'implement' | 'runGates'>>({
  startToCloseTimeout: '45 minutes',
  heartbeatTimeout: '2 minutes',
  retry: { maximumAttempts: 2, initialInterval: '10 seconds' },
});

export type TicketRunInput = {
  key: string;
  approval?: Partial<ApprovalPolicy>;
  /** Overrides the repo profile's implementation rounds; tests use it. */
  maxImplementRounds?: number;
};

type Decision = Exclude<Approval, 'pending'>;

/** A human can decide from the CLI or the API instead of setting a label. */
export const approvalDecisionSignal = defineSignal<[Decision]>(WORKFLOW_CONTRACT.approvalSignal);
export const runQuery = defineQuery<Run>(WORKFLOW_CONTRACT.runQuery);

/**
 * One workflow per ticket: intake, spec, human decision, implementation in a sandbox, gates,
 * merge request. Review (phase 3) continues from `mr_opened`. State changes go through the domain
 * state machine only.
 */
export async function ticketRunWorkflow(input: TicketRunInput): Promise<Run> {
  const policy = { ...DEFAULT_APPROVAL_POLICY, ...input.approval };
  let run = await activities.intake(input.key);
  let decision: Decision | undefined;
  setHandler(approvalDecisionSignal, (value) => {
    decision = value;
  });
  setHandler(runQuery, () => run);
  /** Each decision applies to one draft, so reading it also clears it. */
  const takeDecision = () => {
    const value = decision;
    decision = undefined;
    return value;
  };
  /** Every transition goes through `run` so the query handler always sees the latest state. */
  const advance = (event: RunEvent) => (run = applyEvent(run, event));

  for (let round = 1; round <= policy.maxDraftRounds; round++) {
    run = { ...run, spec: await activities.draftSpec(run) };
    advance('spec_drafted');

    const outcome = await waitForDecision(input.key, policy, () => decision !== undefined, takeDecision);
    if (outcome === 'approved') {
      advance('spec_approved');
      break;
    }
    if (outcome === 'timeout') return advance('escalated');
    advance('spec_rejected');
  }
  if (run.state !== 'spec_approved') return advance('escalated');

  // The run carries its repository's policy from intake; the override exists for tests.
  const rounds = input.maxImplementRounds ?? run.policy.maxImplementRounds;
  const workspace = await activities.prepare(run);
  run = { ...run, branch: workspace.branch };
  // What already fails on the pristine checkout is the base branch's problem, not this run's.
  const baselineFailures = await longActivities.baseline(run, workspace);
  let feedback: string | undefined;
  for (let round = 1; round <= rounds; round++) {
    const { implementation, diff } = await longActivities.implement(run, workspace, feedback);
    run = { ...run, estimatedCostUsd: run.estimatedCostUsd + implementation.estimatedCostUsd, tokens: addTokens(run.tokens, implementation.tokens) };
    advance('implemented');

    const gates = await longActivities.runGates(run, workspace, diff, baselineFailures);
    run = { ...run, gates };
    if (gates.every((gate) => gate.passed)) {
      advance('gates_passed');
      const pullRequest = await activities.openPullRequest(run, workspace, gates);
      run = { ...run, pullRequestUrl: pullRequest.url };
      await activities.cleanup(workspace);
      return advance('mr_opened');
    }
    if (round < rounds && canRetryAfter(gates)) {
      feedback = await activities.gateFeedback(gates);
      advance('gates_failed');
      continue;
    }
    // Out of rounds, or a failure no retry can fix: keep the work on its branch and hand over.
    await activities.pushWorkInProgress(run, workspace, gates);
    await activities.cleanup(workspace);
    return advance('escalated');
  }
  return advance('escalated');
}

/** Waits for a signal or a label change, whichever comes first, until the policy's timeout. */
async function waitForDecision(
  key: string,
  policy: ApprovalPolicy,
  hasDecision: () => boolean,
  takeDecision: () => Decision | undefined,
): Promise<Decision | 'timeout'> {
  const deadline = Date.now() + policy.timeoutHours * 3_600_000;
  while (Date.now() < deadline) {
    const gotSignal = await condition(hasDecision, policy.pollSeconds * 1000);
    if (gotSignal) return takeDecision() as Decision;
    const polled = await activities.readApproval(key);
    if (polled !== 'pending') return polled;
  }
  return 'timeout';
}
