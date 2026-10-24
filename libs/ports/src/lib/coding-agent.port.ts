import type { Implementation, RepoProfile, Spec, Checkout } from '@zenthos/domain';

export type ImplementInput = {
  checkout: Checkout;
  spec: Spec;
  profile: RepoProfile;
  /** Gate failures from the previous attempt, so the agent can fix them. */
  feedback?: string;
};

/** Writes code in the checkout to satisfy the spec. May only run commands the profile allows. */
export interface CodingAgentPort {
  implement(input: ImplementInput): Promise<Implementation>;
}
