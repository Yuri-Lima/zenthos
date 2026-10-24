import type { CommandResult, Diff, RepoProfile, Checkout } from '@zenthos/domain';

/** An isolated checkout where the agent works and the gates run. Commands outside the profile allowlist never run. */
export interface SandboxPort {
  prepare(profile: RepoProfile, branch: string): Promise<Checkout>;
  /** Throws DomainError('command_not_allowed') unless the command is in profile.allowedCommands. */
  run(checkout: Checkout, command: string): Promise<CommandResult>;
  diff(checkout: Checkout): Promise<Diff>;
  commitAndPush(checkout: Checkout, message: string): Promise<void>;
  cleanup(checkout: Checkout): Promise<void>;
}
