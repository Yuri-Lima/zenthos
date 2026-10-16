/** The labels a human sets on the ticket to decide on a spec. One place, read by every adapter. */
export const APPROVAL_LABELS = {
  approved: 'zenthos:spec-approved',
  rejected: 'zenthos:spec-rejected',
} as const;

/** Adding this label to a ticket starts a run, when the webhook is connected (ADR 007). */
export const RUN_LABEL = 'zenthos:run';

export type Approval = 'approved' | 'rejected' | 'pending';

export function approvalFromLabels(labels: readonly string[]): Approval {
  if (labels.includes(APPROVAL_LABELS.rejected)) return 'rejected';
  if (labels.includes(APPROVAL_LABELS.approved)) return 'approved';
  return 'pending';
}

/** How long a run waits for a human and how often it looks. Overridable per run for tests. */
export type ApprovalPolicy = {
  pollSeconds: number;
  timeoutHours: number;
  /** Spec drafts before the run escalates to a human. */
  maxDraftRounds: number;
};

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  pollSeconds: 60,
  timeoutHours: 72,
  maxDraftRounds: 2,
};
