import { condition, defineQuery, defineSignal, proxyActivities, setHandler } from '@temporalio/workflow';
import { addTokens, applyEvent, canRetryAfter, DEFAULT_APPROVAL_POLICY, WORKFLOW_CONTRACT, type Approval, type ApprovalPolicy, type Run, type RunEvent, type Workspace } from '@zenthos/domain';
import type { Activities } from './activities.js';

const activities = proxyActivities<Activities>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 3 },
});

/**
 * The coding agent, the gates and the reviewer run for a long time. They heartbeat every 30 seconds,
 * so a dead worker is noticed within 2 minutes and the attempt moves to a live worker; each attempt
 * is safe to repeat. A model or gate failure inside the attempt is a result, not an exception.
 */
const longActivities = proxyActivities<Pick<Activities, 'baseline' | 'implement' | 'runGates' | 'review'>>({
  startToCloseTimeout: '45 minutes',
  heartbeatTimeout: '2 minutes',
  retry: { maximumAttempts: 2, initialInterval: '10 seconds' },
});

export type TicketRunInput = {
  key: string;
  approval?: Partial<ApprovalPolicy>;
  /** Overrides for tests; production reads the run's policy. */
  maxImplementRounds?: number;
  maxReviewRounds?: number;
};

type Decision = Exclude<Approval, 'pending'>;

/** A human can decide from the CLI or the API instead of setting a label. */
export const approvalDecisionSignal = defineSignal<[Decision]>(WORKFLOW_CONTRACT.approvalSignal);
export const runQuery = defineQuery<Run>(WORKFLOW_CONTRACT.runQuery);

/**
 * One workflow per ticket: intake, spec, human decision, implementation in a sandbox, gates, pull
 * request, review on the pull request. A failed review sends the agent back to the same workspace
 * once; humans merge. State changes go through the domain state machine only.
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

  const implementRounds = input.maxImplementRounds ?? run.policy.maxImplementRounds;
  const reviewRounds = input.maxReviewRounds ?? run.policy.maxReviewRounds;
  const workspace = await activities.prepare(run);
  run = { ...run, branch: workspace.branch };
  // What already fails on the pristine checkout is the base branch's problem, not this run's.
  const baselineFailures = await longActivities.baseline(run, workspace);

  /** Implements until the gates pass or the rounds run out. On exhaustion the branch is pushed and the run escalates. */
  const implementUntilGatesPass = async (feedback: string | undefined): Promise<'passed' | 'escalated'> => {
    for (let round = 1; round <= implementRounds; round++) {
      const { implementation, diff } = await longActivities.implement(run, workspace, feedback);
      run = { ...run, estimatedCostUsd: run.estimatedCostUsd + implementation.estimatedCostUsd, tokens: addTokens(run.tokens, implementation.tokens) };
      advance('implemented');

      const gates = await longActivities.runGates(run, workspace, diff, baselineFailures);
      run = { ...run, gates };
      if (gates.every((gate) => gate.passed)) return 'passed';
      if (round < implementRounds && canRetryAfter(gates)) {
        feedback = await activities.gateFeedback(gates);
        advance('gates_failed');
        continue;
      }
      await activities.pushWorkInProgress(run, workspace, gates);
      await activities.cleanup(workspace);
      advance('escalated');
      return 'escalated';
    }
    advance('escalated');
    return 'escalated';
  };

  let feedback: string | undefined;
  for (let reviewRound = 0; reviewRound <= reviewRounds; reviewRound++) {
    if ((await implementUntilGatesPass(feedback)) === 'escalated') return run;
    advance('gates_passed');
    run = { ...run, pullRequest: await activities.openPullRequest(run, workspace, run.gates ?? []) };
    advance('mr_opened');

    const { review, gate } = await longActivities.review(run);
    run = { ...run, review, gates: [...(run.gates ?? []), gate] };
    if (gate.passed) {
      await activities.cleanup(workspace);
      return advance('review_passed');
    }
    if (reviewRound < reviewRounds) {
      feedback = await activities.reviewFeedback(review);
      advance('review_failed');
      continue;
    }
    await activities.cleanup(workspace);
    return advance('escalated');
  }
  return run;
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

export type { Workspace };
