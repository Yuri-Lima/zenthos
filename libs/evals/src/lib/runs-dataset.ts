import type { PullRequestState, RepoProfile } from '@zenthos/domain';
import type { RunsPort, ScmPort } from '@zenthos/ports';
import { parseDataset, type GoldenDataset, type GoldenItem } from './dataset.js';

const VERDICTS: Partial<Record<PullRequestState, GoldenItem['verdict']>> = { merged: 'accepted', closed: 'rejected' };

export type RunsDatasetResult = { dataset?: GoldenDataset; skipped: { ticketKey: string; reason: string }[] };

/**
 * The pipeline's own runs as eval items: every stored run that opened a pull request a human has since
 * merged or closed, with the spec it implemented. Open pull requests wait; runs without one are not changes.
 */
export async function buildRunsDataset({ runs, scm }: { runs: RunsPort; scm: ScmPort }, profile: RepoProfile, now = new Date()): Promise<RunsDatasetResult> {
  const items: GoldenItem[] = [];
  const skipped: RunsDatasetResult['skipped'] = [];
  const seen = new Set<number>();
  for (const run of await runs.list()) {
    if (run.ticket.key.slice(0, run.ticket.key.lastIndexOf('#')) !== profile.repo) continue;
    if (!run.spec || !run.pullRequest) {
      skipped.push({ ticketKey: run.ticket.key, reason: `state ${run.state}, no pull request` });
      continue;
    }
    if (seen.has(run.pullRequest.number)) continue;
    seen.add(run.pullRequest.number);
    const verdict = VERDICTS[await scm.pullRequestState(profile, run.pullRequest)];
    if (!verdict) {
      skipped.push({ ticketKey: run.ticket.key, reason: `pull request #${run.pullRequest.number} still open` });
      continue;
    }
    const { files } = await scm.readPullRequestDiff(profile, run.pullRequest);
    items.push({ ticketKey: run.ticket.key, pullRequest: run.pullRequest, files, verdict, spec: run.spec });
  }
  items.sort((a, b) => a.ticketKey.localeCompare(b.ticketKey));
  return { dataset: items.length ? parseDataset({ repo: profile.repo, source: 'runs', builtAt: now.toISOString(), items }) : undefined, skipped };
}
