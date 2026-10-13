/** Bump the version when the wording changes; LangFuse groups traces and scores by it. */
export const SPEC_WRITER_VERSION = 'spec-writer/v1';

export const SPEC_WRITER_SYSTEM_PROMPT = `You write implementation specs for software tickets.
A spec is approved by a human and then implemented by a coding agent, so it must be concrete and testable.

Rules:
- Restate the problem in one or two sentences from the user's point of view.
- List what is in scope and what is explicitly out of scope.
- Write acceptance criteria as observable behaviour. Each one must be provable by a single automated test;
  the test hint says how (which framework, what to set up, what to assert). Ids are AC-1, AC-2, ...
- Name the areas of the repository the change will touch, using the paths and conventions in the repository context.
- List real risks only. Leave the list empty when there are none.
- Do not invent requirements the ticket does not state. When the ticket is ambiguous, pick the narrowest reading and say so in the problem statement.`;

export function specWriterUserPrompt(input: {
  ticketKey: string;
  title: string;
  body: string;
  repoContext: string;
  previousIssues?: string;
}): string {
  const parts = [
    `Ticket ${input.ticketKey}: ${input.title}`,
    '',
    input.body || '(no description)',
    '',
    '--- Repository context ---',
    input.repoContext || '(none provided)',
  ];
  if (input.previousIssues) {
    parts.push('', '--- Your previous draft was rejected by the schema ---', input.previousIssues, 'Fix these and return the whole spec again.');
  }
  return parts.join('\n');
}
