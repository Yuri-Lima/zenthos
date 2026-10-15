import type { Diff, GateResult, RepoProfile, Review, Spec } from '@zenthos/domain';

export type ReviewInput = {
  spec: Spec;
  diff: Diff;
  gates: GateResult[];
  profile: RepoProfile;
};

/** Scores a change against the rubric and lists findings. Implemented by an agent or a test fake. */
export interface ReviewerPort {
  review(input: ReviewInput): Promise<Review>;
}
