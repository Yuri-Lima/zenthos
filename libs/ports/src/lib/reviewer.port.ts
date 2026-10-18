import type { Diff, GateResult, RepoProfile, Review, Spec, Usage } from '@zenthos/domain';

export type ReviewInput = {
  spec: Spec;
  diff: Diff;
  gates: GateResult[];
  profile: RepoProfile;
};

export type ReviewOutput = { review: Review } & Usage;

/** Scores a change against the rubric and lists findings, reporting what it cost. Implemented by an agent or a test fake. */
export interface ReviewerPort {
  review(input: ReviewInput): Promise<ReviewOutput>;
}
