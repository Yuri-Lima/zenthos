import type { Diff, PullRequest, PullRequestState, RepoProfile, Checkout } from '@zenthos/domain';

export type OpenPullRequestInput = {
  profile: RepoProfile;
  checkout: Checkout;
  title: string;
  body: string;
  /** The adapter adds the line that links and closes the ticket in its tracker's syntax. */
  ticketKey: string;
};

export type PostReviewInput = {
  profile: RepoProfile;
  pullRequest: PullRequest;
  /** Markdown; the adapter posts it as a review comment, never as an approval. */
  body: string;
};

/** The merge request side of the pipeline: open it, read what is on it, and comment on it. */
export interface ScmPort {
  openPullRequest(input: OpenPullRequestInput): Promise<PullRequest>;
  /** The open pull request for a branch, so a later round reuses it instead of opening a second one. */
  findPullRequest(profile: RepoProfile, branch: string): Promise<PullRequest | undefined>;
  /** The diff as the host serves it, so the reviewer judges what humans will merge. */
  readPullRequestDiff(profile: RepoProfile, pullRequest: PullRequest): Promise<Diff>;
  postReview(input: PostReviewInput): Promise<void>;
  /** Open, merged or closed without merge: the human verdict the evals compare the reviewer with. */
  pullRequestState(profile: RepoProfile, pullRequest: PullRequest): Promise<PullRequestState>;
}
