/** Single list of error codes. Every thrown DomainError carries one of these. */
export const ERROR_CODES = {
  invalid_transition: 'A run cannot take this event from its current state',
  ticket_not_found: 'The issue tracker has no ticket with this key',
  invalid_ticket: 'The ticket does not match the Ticket schema',
  invalid_spec: 'The spec does not match the Spec schema',
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
