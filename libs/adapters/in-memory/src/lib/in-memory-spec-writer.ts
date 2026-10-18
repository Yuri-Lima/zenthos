import { NO_USAGE } from '@zenthos/domain';
import type { SpecDraft, SpecWriterInput, SpecWriterPort } from '@zenthos/ports';

/** SpecWriter that needs no model: one criterion built from the ticket title. For tests and dry runs. */
export class InMemorySpecWriter implements SpecWriterPort {
  async draftSpec({ ticket }: SpecWriterInput): Promise<SpecDraft> {
    const spec = {
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
    return { spec, ...NO_USAGE };
  }
}
