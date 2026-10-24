import { condition, defineQuery, defineSignal, proxyActivities, setHandler } from '@temporalio/workflow';
import { applyEvent, canRetryAfter, DEFAULT_APPROVAL_POLICY, withUsage, WORKFLOW_CONTRACT, type Approval, type ApprovalPolicy, type Run, type RunEvent, type Checkout } from '@zenthos/domain';
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
  /** The person who started the run, when one did (dashboard login, label setter, "cli"). */
  requestedBy?: string;
};

type Decision = Exclude<Approval, 'pending'>;

/** A human can decide from the CLI or the API instead of setting a label; the second argument says who. */
export const approvalDecisionSignal = defineSignal<[Decision, string?]>(WORKFLOW_CONTRACT.approvalSignal);
export const runQuery = defineQuery<Run>(WORKFLOW_CONTRACT.runQuery);

/**
 * One workflow per ticket: intake, spec, human decision, implementation in a sandbox, gates, pull
 * request, review on the pull request. A failed review sends the agent back to the same checkout
 * once; humans merge. State changes go through the domain state machine only.
 */
export async function ticketRunWorkflow(input: TicketRunInput): Promise<Run> {
  const policy = { ...DEFAULT_APPROVAL_POLICY, ...input.approval };
  let run = await activities.intake(input.key);
  if (input.requestedBy) run = { ...run, requestedBy: input.requestedBy };
  await activities.recordRun(run);
  let decision: { value: Decision; by?: string } | undefined;
  setHandler(approvalDecisionSignal, (value, by) => {
    decision = { value, by };
  });
  setHandler(runQuery, () => run);
  /** Each decision applies to one draft, so reading it also clears it. */
  const takeDecision = () => {
    const value = decision;
    decision = undefined;
    return value;
  };
  /** Every transition goes through `run`, so the query handler and the stored projection always see the latest state. */
  const advance = async (event: RunEvent, by?: string): Promise<Run> => {
    run = applyEvent(run, event, new Date(), by);
    await activities.recordRun(run);
    return run;
  };

  for (let round = 1; round <= policy.maxDraftRounds; round++) {
    const draft = await activities.draftSpec(run);
    run = { ...withUsage(run, draft, 'spec_writer'), spec: draft.spec };
    await advance('spec_drafted');

    const outcome = await waitForDecision(input.key, policy, () => decision !== undefined, takeDecision);
    if (outcome.value === 'approved') {
      await advance('spec_approved', outcome.by);
      break;
    }
    if (outcome.value === 'timeout') return await advance('escalated');
    await advance('spec_rejected', outcome.by);
  }
  if (run.state !== 'spec_approved') return await advance('escalated');

  const implementRounds = input.maxImplementRounds ?? run.policy.maxImplementRounds;
  const reviewRounds = input.maxReviewRounds ?? run.policy.maxReviewRounds;
  const checkout = await activities.prepare(run);
  run = { ...run, branch: checkout.branch };
  // What already fails on the pristine checkout is the base branch's problem, not this run's.
  const baselineFailures = await longActivities.baseline(run, checkout);

  /** Implements until the gates pass or the rounds run out. On exhaustion the branch is pushed and the run escalates. */
  const implementUntilGatesPass = async (feedback: string | undefined): Promise<'passed' | 'escalated'> => {
    for (let round = 1; round <= implementRounds; round++) {
      const { implementation, diff } = await longActivities.implement(run, checkout, feedback);
      run = withUsage(run, implementation, 'coding_agent');
      await advance('implemented');

      const gates = await longActivities.runGates(run, checkout, diff, baselineFailures);
      run = { ...run, gates };
      if (gates.every((gate) => gate.passed)) return 'passed';
      if (round < implementRounds && canRetryAfter(gates)) {
        feedback = await activities.gateFeedback(gates);
        await advance('gates_failed');
        continue;
      }
      await activities.pushWorkInProgress(run, checkout, gates);
      await activities.cleanup(checkout);
      await advance('escalated');
      return 'escalated';
    }
    await advance('escalated');
    return 'escalated';
  };

  let feedback: string | undefined;
  for (let reviewRound = 0; reviewRound <= reviewRounds; reviewRound++) {
    if ((await implementUntilGatesPass(feedback)) === 'escalated') return run;
    await advance('gates_passed');
    run = { ...run, pullRequest: await activities.openPullRequest(run, checkout, run.gates ?? []) };
    await advance('mr_opened');

    const { review, gate, ...reviewUsage } = await longActivities.review(run);
    run = { ...withUsage(run, reviewUsage, 'reviewer'), review, gates: [...(run.gates ?? []), gate] };
    if (gate.passed) {
      await activities.cleanup(checkout);
      return await advance('review_passed');
    }
    if (reviewRound < reviewRounds) {
      feedback = await activities.reviewFeedback(review);
      await advance('review_failed');
      continue;
    }
    await activities.cleanup(checkout);
    return await advance('escalated');
  }
  return run;
}

/** Waits for a signal or a label change, whichever comes first, until the policy's timeout. */
async function waitForDecision(
  key: string,
  policy: ApprovalPolicy,
  hasDecision: () => boolean,
  takeDecision: () => { value: Decision; by?: string } | undefined,
): Promise<{ value: Decision | 'timeout'; by?: string }> {
  const deadline = Date.now() + policy.timeoutHours * 3_600_000;
  while (Date.now() < deadline) {
    const gotSignal = await condition(hasDecision, policy.pollSeconds * 1000);
    if (gotSignal) return takeDecision() as { value: Decision; by?: string };
    const polled = await activities.readApproval(key);
    if (polled !== 'pending') return { value: polled };
  }
  return { value: 'timeout' };
}

export type { Checkout };
