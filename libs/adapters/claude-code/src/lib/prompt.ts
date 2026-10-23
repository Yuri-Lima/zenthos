import { TRACE_VERSION_PREFIX } from '@zenthos/domain';
import type { ImplementInput } from '@zenthos/ports';

/** Names the coding agent in traces and in the cost check; bump it when the prompt below changes. */
export const CLAUDE_CODE_AGENT_VERSION = `${TRACE_VERSION_PREFIX.coding_agent}v1`;

/** The task as the coding agent reads it. The repo's own CLAUDE.md is loaded by Claude Code from the workspace. */
export function implementationPrompt({ spec, profile, feedback }: ImplementInput): string {
  const criteria = spec.acceptanceCriteria.map((c) => `- ${c.id}: ${c.statement}\n  Test: ${c.testHint}`).join('\n');
  return [
    `Implement ticket ${spec.ticketKey} in this repository.`,
    '',
    `Problem: ${spec.problem}`,
    '',
    'In scope:',
    ...spec.inScope.map((item) => `- ${item}`),
    spec.outOfScope.length ? `\nOut of scope:\n${spec.outOfScope.map((item) => `- ${item}`).join('\n')}` : '',
    '',
    'Acceptance criteria. Add or update one automated test per criterion:',
    criteria,
    '',
    `Areas expected to change: ${spec.touchedAreas.join(', ')}.`,
    '',
    'Rules:',
    `- Shell commands you may run, exactly as written: ${profile.allowedCommands.map((c) => `\`${c}\``).join(', ')}. Any other command is refused.`,
    `- Do not touch files under: ${profile.policy.forbiddenPathPrefixes.join(', ')}. Do not run git; the pipeline commits and pushes.`,
    '- Follow the conventions in this repository\'s CLAUDE.md or AGENTS.md. Keep the change small and readable.',
    '- When done, reply with a short summary of what changed and which tests cover each criterion.',
    feedback ? `\nThe previous attempt failed these gates. Fix them:\n${feedback}` : '',
  ]
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n');
}
