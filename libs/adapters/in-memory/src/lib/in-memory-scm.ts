import type { Diff, PullRequest, PullRequestState, RepoProfile } from '@zenthos/domain';
import type { OpenPullRequestInput, PostReviewInput, ScmPort } from '@zenthos/ports';

/** Records pull requests and reviews instead of opening them; serves a canned diff for the reviewer. */
export class InMemoryScm implements ScmPort {
  readonly opened: OpenPullRequestInput[] = [];
  readonly reviews: PostReviewInput[] = [];
  private readonly byBranch = new Map<string, PullRequest>();
  /** Pull request number → what a test says the humans did with it; open unless set. */
  readonly states = new Map<number, PullRequestState>();

  constructor(private readonly diff: Diff = { files: ['docs/zenthos-implementation.md'], changedLines: 12, patch: '+# implementation' }) {}

  async openPullRequest(input: OpenPullRequestInput): Promise<PullRequest> {
    this.opened.push(input);
    const number = this.opened.length;
    const pullRequest = { number, url: `https://example.test/${input.profile.repo}/pull/${number}` };
    this.byBranch.set(`${input.profile.repo}@${input.checkout.branch}`, pullRequest);
    return pullRequest;
  }

  async findPullRequest(profile: RepoProfile, branch: string): Promise<PullRequest | undefined> {
    return this.byBranch.get(`${profile.repo}@${branch}`);
  }

  async readPullRequestDiff(): Promise<Diff> {
    return this.diff;
  }

  async postReview(input: PostReviewInput): Promise<void> {
    this.reviews.push(input);
  }

  async pullRequestState(_profile: RepoProfile, pullRequest: PullRequest): Promise<PullRequestState> {
    return this.states.get(pullRequest.number) ?? 'open';
  }
}
