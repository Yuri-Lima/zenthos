import { APPROVAL_LABELS, approvalFromLabels } from './approval.js';

describe('approvalFromLabels', () => {
  it('is pending without a decision label', () => {
    expect(approvalFromLabels(['bug', 'needs-triage'])).toBe('pending');
  });

  it('reads the approval label', () => {
    expect(approvalFromLabels(['bug', APPROVAL_LABELS.approved])).toBe('approved');
  });

  it('lets a rejection win over an approval left behind', () => {
    expect(approvalFromLabels([APPROVAL_LABELS.approved, APPROVAL_LABELS.rejected])).toBe('rejected');
  });
});
