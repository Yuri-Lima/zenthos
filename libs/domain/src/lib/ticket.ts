import { z } from 'zod';
import { DomainError } from './errors.js';

/** A ticket as the core sees it, whatever tracker it came from. */
export const TicketSchema = z.object({
  /** Tracker-specific key, e.g. "owner/repo#123" or "PHX-42". */
  key: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
  url: z.url(),
  labels: z.array(z.string()).default([]),
});

export type Ticket = z.infer<typeof TicketSchema>;

export function parseTicket(input: unknown): Ticket {
  const result = TicketSchema.safeParse(input);
  if (!result.success) {
    throw new DomainError('invalid_ticket', { issues: result.error.issues });
  }
  return result.data;
}
