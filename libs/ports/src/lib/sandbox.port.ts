import type { CommandResult, Diff, RepoProfile, Workspace } from '@zenthos/domain';

/** An isolated checkout where the agent works and the gates run. Commands outside the profile allowlist never run. */
export interface SandboxPort {
  prepare(profile: RepoProfile, branch: string): Promise<Workspace>;
  /** Throws DomainError('command_not_allowed') unless the command is in profile.allowedCommands. */
  run(workspace: Workspace, command: string): Promise<CommandResult>;
  diff(workspace: Workspace): Promise<Diff>;
  commitAndPush(workspace: Workspace, message: string): Promise<void>;
  cleanup(workspace: Workspace): Promise<void>;
}
