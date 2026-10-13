import type { Spec } from '@zenthos/domain';
import type { SpecWriterInput, SpecWriterPort } from '@zenthos/ports';

/** SpecWriter that needs no model: one criterion built from the ticket title. For tests and dry runs. */
export class InMemorySpecWriter implements SpecWriterPort {
  async draftSpec({ ticket }: SpecWriterInput): Promise<Spec> {
    return {
      ticketKey: ticket.key,
      problem: `Ticket ${ticket.key}: ${ticket.title}`,
      inScope: [ticket.title],
      outOfScope: [],
      acceptanceCriteria: [
        { id: 'AC-1', statement: `${ticket.title} works as described in the ticket`, testHint: 'to be written' },
      ],
      touchedAreas: ['unknown'],
      risks: [],
    };
  }
}
