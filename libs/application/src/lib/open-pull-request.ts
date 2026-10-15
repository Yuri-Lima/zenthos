import type { GateResult, PullRequest, RepoProfile, Run, Workspace } from '@zenthos/domain';
import type { SandboxPort, ScmPort } from '@zenthos/ports';

/**
 * Use case 6: push the branch and open the merge request a human will review. A later round of the
 * same run pushes to the same branch and reuses the pull request that is already open for it.
 */
export async function openPullRequest(
  { sandbox, scm }: { sandbox: SandboxPort; scm: ScmPort },
  run: Run,
  workspace: Workspace,
  gates: GateResult[],
  profile: RepoProfile,
): Promise<PullRequest> {
  const title = `${run.ticket.title} (${run.ticket.key})`;
  await sandbox.commitAndPush(workspace, title);
  const existing = await scm.findPullRequest(profile, workspace.branch);
  if (existing) return existing;
  return scm.openPullRequest({ profile, workspace, title, body: renderPullRequestBody(run, gates), ticketKey: run.ticket.key });
}

/** When a run escalates, the branch is still pushed so a human can pick the work up. No merge request. */
export async function pushWorkInProgress({ sandbox }: { sandbox: SandboxPort }, run: Run, workspace: Workspace, gates: GateResult[]): Promise<string> {
  const failed = gates.filter((gate) => !gate.passed).map((gate) => gate.gate).join(', ');
  await sandbox.commitAndPush(workspace, `WIP: ${run.ticket.title} (${run.ticket.key}); gates failed: ${failed}`);
  return workspace.branch;
}

export function renderPullRequestBody(run: Run, gates: GateResult[]): string {
  const spec = run.spec;
  const criteria = spec?.acceptanceCriteria.map((c) => `- **${c.id}** ${c.statement}`).join('\n') ?? '';
  const gateLines = gates.map((g) => `- ${g.passed ? 'pass' : 'fail'} ${g.gate}${g.detail ? `: ${g.detail}` : ''}`).join('\n');
  return [
    `Implemented by ZenthOs for ${run.ticket.key}.`,
    '',
    spec ? `**Problem.** ${spec.problem}` : '',
    '',
    '**Acceptance criteria**',
    criteria,
    '',
    '**Gates**',
    gateLines,
    '',
    `Run \`${run.id}\`: ${run.tokens.inputTokens + run.tokens.cacheReadTokens + run.tokens.cacheWriteTokens} input and ${run.tokens.outputTokens} output tokens, about ${run.estimatedCostUsd.toFixed(2)} USD at list price.`,
  ]
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n');
}
