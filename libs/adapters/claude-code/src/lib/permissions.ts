import { isCommandAllowed, type RepoProfile } from '@zenthos/domain';

export type PermissionDecision = { behavior: 'allow' } | { behavior: 'deny'; message: string };

/**
 * What the agent may do beyond reading and editing files (those are auto-approved by `acceptEdits`).
 * Bash goes through the same allowlist as the sandbox; everything else that asks is refused.
 */
export function decideToolUse(profile: RepoProfile, toolName: string, input: Record<string, unknown>): PermissionDecision {
  if (toolName !== 'Bash') return { behavior: 'deny', message: `${toolName} is not available in a ZenthOs sandbox` };
  const command = typeof input['command'] === 'string' ? input['command'] : '';
  return isCommandAllowed(command, profile.allowedCommands)
    ? { behavior: 'allow' }
    : { behavior: 'deny', message: `Command not in the allowlist. Allowed: ${profile.allowedCommands.join(' | ')}` };
}
