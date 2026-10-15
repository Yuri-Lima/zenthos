import type { PullRequest, RepoProfile, Workspace } from '@zenthos/domain';

export type OpenPullRequestInput = {
  profile: RepoProfile;
  workspace: Workspace;
  title: string;
  body: string;
  /** The adapter adds the line that links and closes the ticket in its tracker's syntax. */
  ticketKey: string;
};

/** Opens the merge request for a pushed branch. */
export interface ScmPort {
  openPullRequest(input: OpenPullRequestInput): Promise<PullRequest>;
}
