import type { Spec, Ticket } from '@zenthos/domain';

export type SpecWriterInput = {
  ticket: Ticket;
  /** Conventions and layout of the target repository, as text the model can read. */
  repoContext: string;
};

/** Turns a ticket into a Spec that passes `parseSpec`. Implemented by an agent or a test fake. */
export interface SpecWriterPort {
  draftSpec(input: SpecWriterInput): Promise<Spec>;
}
