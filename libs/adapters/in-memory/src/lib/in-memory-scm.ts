import type { PullRequest } from '@zenthos/domain';
import type { OpenPullRequestInput, ScmPort } from '@zenthos/ports';

/** Records pull requests instead of opening them. */
export class InMemoryScm implements ScmPort {
  readonly opened: OpenPullRequestInput[] = [];

  async openPullRequest(input: OpenPullRequestInput): Promise<PullRequest> {
    this.opened.push(input);
    const number = this.opened.length;
    return { number, url: `https://example.test/${input.profile.repo}/pull/${number}` };
  }
}
