import { z } from 'zod';
import { APPROVAL_LABELS, RUN_LABEL } from './approval.js';
import type { Installation } from './provider-connection.js';

/**
 * What the pipeline does with a GitHub webhook delivery. A label is how a human talks to a run on
 * the ticket (ADR 007: labels signal the workflow instead of polling); installation events keep the
 * connection's list of repositories current. Everything else is ignored, by name.
 */
export type WebhookCommand =
  | { kind: 'start'; ticketKey: string; actor?: string }
  | { kind: 'decision'; ticketKey: string; decision: 'approved' | 'rejected'; actor?: string }
  | { kind: 'installation'; action: 'added' | 'removed'; installation: Installation }
  | { kind: 'repositories'; installationId: number; account: string; added: string[]; removed: string[] }
  | { kind: 'ignore'; reason: string };

const IssueLabeled = z.object({
  action: z.literal('labeled'),
  label: z.object({ name: z.string() }),
  issue: z.object({ number: z.number().int() }),
  repository: z.object({ full_name: z.string() }),
  /** The GitHub user who set the label: the audit trail for a decision made on the ticket. */
  sender: z.object({ login: z.string() }).optional(),
});

const InstallationEvent = z.object({
  action: z.enum(['created', 'deleted', 'added', 'removed', 'new_permissions_accepted', 'suspend', 'unsuspend']),
  installation: z.object({ id: z.number().int(), account: z.object({ login: z.string() }) }),
  repositories: z.array(z.object({ full_name: z.string() })).optional(),
  repositories_added: z.array(z.object({ full_name: z.string() })).optional(),
  repositories_removed: z.array(z.object({ full_name: z.string() })).optional(),
});

export function commandFromGitHubEvent(event: string, payload: unknown): WebhookCommand {
  if (event === 'issues') {
    const parsed = IssueLabeled.safeParse(payload);
    if (!parsed.success) return { kind: 'ignore', reason: 'issues event that is not a label being added' };
    const { label, issue, repository, sender } = parsed.data;
    const ticketKey = `${repository.full_name}#${issue.number}`;
    const actor = sender?.login;
    if (label.name === RUN_LABEL) return { kind: 'start', ticketKey, actor };
    if (label.name === APPROVAL_LABELS.approved) return { kind: 'decision', ticketKey, decision: 'approved', actor };
    if (label.name === APPROVAL_LABELS.rejected) return { kind: 'decision', ticketKey, decision: 'rejected', actor };
    return { kind: 'ignore', reason: `label ${label.name} means nothing to the pipeline` };
  }
  if (event === 'installation' || event === 'installation_repositories') {
    const parsed = InstallationEvent.safeParse(payload);
    if (!parsed.success) return { kind: 'ignore', reason: `${event} payload not understood` };
    const { action, installation, repositories = [], repositories_added = [], repositories_removed = [] } = parsed.data;
    const base = { installationId: installation.id, account: installation.account.login };
    if (action === 'deleted') return { kind: 'installation', action: 'removed', installation: { ...base, repositories: [] } };
    if (action === 'created') return { kind: 'installation', action: 'added', installation: { ...base, repositories: repositories.map((r) => r.full_name) } };
    if (action === 'added' || action === 'removed') {
      return { kind: 'repositories', ...base, added: repositories_added.map((r) => r.full_name), removed: repositories_removed.map((r) => r.full_name) };
    }
    return { kind: 'ignore', reason: `installation action ${action} changes nothing the pipeline uses` };
  }
  return { kind: 'ignore', reason: `event ${event} is not handled` };
}
