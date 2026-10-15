import { branchNameFor, DomainError, type Diff, type Implementation, type RepoProfile, type Run, type Workspace } from '@zenthos/domain';
import type { CodingAgentPort, SandboxPort } from '@zenthos/ports';

export type ImplementationResult = { implementation: Implementation; diff: Diff };

/** Use case 4a: a fresh checkout on the run's branch. */
export function prepareWorkspace({ sandbox }: { sandbox: SandboxPort }, run: Run, profile: RepoProfile): Promise<Workspace> {
  return sandbox.prepare(profile, branchNameFor(run.ticket.key));
}

/**
 * Use case 4b: which gate commands already fail on the pristine checkout. Those failures belong to
 * the base branch, not to the change, so the gates skip them and the agent is never asked to fix them.
 */
export async function baselineGates({ sandbox }: { sandbox: SandboxPort }, workspace: Workspace, profile: RepoProfile): Promise<string[]> {
  const failing: string[] = [];
  for (const command of profile.gateCommands) {
    if ((await sandbox.run(workspace, command)).exitCode !== 0) failing.push(command);
  }
  return failing;
}

/**
 * Use case 4c: the agent's work and the diff it actually produced. A retry runs in the same
 * workspace with the failed gates as feedback, so the agent fixes its own change instead of starting over.
 */
export async function implementSpec(
  { sandbox, codingAgent }: { sandbox: SandboxPort; codingAgent: CodingAgentPort },
  run: Run,
  workspace: Workspace,
  profile: RepoProfile,
  feedback?: string,
): Promise<ImplementationResult> {
  if (!run.spec) throw new DomainError('invalid_spec', { reason: 'run has no approved spec' });
  const implementation = await codingAgent.implement({ workspace, spec: run.spec, profile, feedback });
  const diff = await sandbox.diff(workspace);
  return { implementation, diff };
}
