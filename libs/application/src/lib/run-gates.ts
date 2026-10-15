import {
  checkCostCeiling,
  checkDiffBudget,
  checkForbiddenPaths,
  checkSecrets,
  fail,
  pass,
  skipped,
  type Diff,
  type GateResult,
  type RepoProfile,
  type Run,
  type Workspace,
} from '@zenthos/domain';
import type { SandboxPort } from '@zenthos/ports';

/**
 * Use case 5: the deterministic gates, cheapest first. Policy gates look at the diff and the run;
 * the repository's own commands run only when those pass, since they are the slow part. A command
 * that already failed on the pristine checkout (`baselineFailures`) is skipped with a note: the
 * change cannot be blamed for it, and asking the agent to fix it invites edits far outside the ticket.
 */
export async function runGates(
  { sandbox }: { sandbox: SandboxPort },
  run: Run,
  workspace: Workspace,
  diff: Diff,
  profile: RepoProfile,
  baselineFailures: readonly string[] = [],
): Promise<GateResult[]> {
  const results: GateResult[] = [
    diff.files.length === 0 ? fail('ci', 'the agent changed nothing') : pass('sandbox_allowlist'),
    checkForbiddenPaths(diff.files, run.policy),
    checkDiffBudget(diff.changedLines, run.policy),
    checkSecrets(diff.patch),
    checkCostCeiling(run.estimatedCostUsd, run.policy),
  ];
  if (results.some((result) => !result.passed)) return results;

  for (const command of profile.gateCommands) {
    if (baselineFailures.includes(command)) {
      results.push(skipped('ci', `${command} skipped: it already fails on ${profile.baseBranch} before this change`));
      continue;
    }
    const result = await sandbox.run(workspace, command);
    if (result.exitCode !== 0) {
      results.push(fail('ci', `${command} exited ${result.exitCode}\n${tail(result.stderr || result.stdout)}`));
      return results;
    }
    results.push(pass('ci'));
  }
  return results;
}

export const gateFeedback = (gates: GateResult[]): string =>
  gates
    .filter((gate) => !gate.passed)
    .map((gate) => `${gate.gate}: ${gate.detail}`)
    .join('\n');

const tail = (text: string, lines = 40) => text.trim().split('\n').slice(-lines).join('\n');
