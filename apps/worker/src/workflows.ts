import { condition, defineQuery, defineSignal, proxyActivities, setHandler } from '@temporalio/workflow';
import { applyEvent, DEFAULT_APPROVAL_POLICY, type Approval, type ApprovalPolicy, type Run, type RunEvent } from '@zenthos/domain';
import type { Activities } from './activities.js';

const activities = proxyActivities<Activities>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 3 },
});

export type TicketRunInput = {
  key: string;
  approval?: Partial<ApprovalPolicy>;
};

type Decision = Exclude<Approval, 'pending'>;

/** A human can decide from the CLI or the API instead of setting a label. */
export const approvalDecisionSignal = defineSignal<[Decision]>('approvalDecision');
export const runQuery = defineQuery<Run>('run');

/**
 * One workflow per ticket. Phase 1 covers intake, spec and the human decision; later phases
 * continue from `spec_approved`. State changes go through the domain state machine only.
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
    if (outcome === 'approved') return advance('spec_approved');
    if (outcome === 'timeout') return advance('escalated');
    advance('spec_rejected');
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
