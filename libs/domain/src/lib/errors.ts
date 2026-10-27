/** Single list of error codes. Every thrown DomainError carries one of these. */
export const ERROR_CODES = {
  invalid_transition: 'A run cannot take this event from its current state',
  ticket_not_found: 'The issue tracker has no ticket with this key',
  invalid_ticket: 'The ticket does not match the Ticket schema',
  invalid_spec: 'The spec does not match the Spec schema',
  command_not_allowed: 'The command is not in the repository profile allowlist',
  implementation_failed: 'The coding agent did not finish the implementation',
  unknown_repository: 'No repository profile matches this ticket key',
  no_credentials: 'No provider connection covers this repository and no fallback credentials are configured',
  app_not_installed: 'The GitHub App is not installed on this repository',
  invalid_review: 'The review does not match the Review schema',
  invalid_run: 'The stored run does not match the Run schema',
  sign_in_unavailable: 'No GitHub App connection carries OAuth credentials, so nobody can sign in yet',
  forbidden: 'This role may not do that in this workspace',
  not_a_member: 'This login is not a member of that workspace',
  workspace_not_found: 'No workspace with that id',
  invalid_workspace: 'The workspace does not match its schema',
  last_owner: 'A workspace keeps at least one owner',
  workspace_required: 'Select a workspace first',
  invalid_connection: 'The provider connection does not match its schema',
  invalid_profile: 'The repository profile is inconsistent',
  connection_not_found: 'No provider connection with that id',
  invalid_credentials: 'The provider rejected these credentials',
  repository_not_found: 'The provider has no such repository, or this connection cannot see it',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly context: Record<string, unknown> = {},
  ) {
    super(ERROR_CODES[code]);
    this.name = 'DomainError';
  }
}
