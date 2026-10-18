import type { Spec, Ticket, Usage } from '@zenthos/domain';

export type SpecWriterInput = {
  ticket: Ticket;
  /** Conventions and layout of the target repository, as text the model can read. */
  repoContext: string;
};

export type SpecDraft = { spec: Spec } & Usage;

/** Turns a ticket into a Spec that passes `parseSpec`, reporting what it cost. Implemented by an agent or a test fake. */
export interface SpecWriterPort {
  draftSpec(input: SpecWriterInput): Promise<SpecDraft>;
}
