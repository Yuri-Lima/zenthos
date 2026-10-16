import { createHash } from 'node:crypto';
import type { GitAuthor, GitHubCredentials } from '@zenthos/domain';
import type { IssueRef } from './issue-key.js';

type IssueParams = { owner: string; repo: string; issue_number: number };
type Label = string | { name?: string };

/** The three issue calls we use, as Octokit's `octokit.rest.issues` exposes them. A fake fits in a test. */
export interface GitHubIssuesApi {
  get(params: IssueParams): Promise<{ data: { title: string; body?: string | null; html_url: string; labels: Label[] } }>;
  createComment(params: IssueParams & { body: string }): Promise<unknown>;
  listComments(params: IssueParams & { per_page: number }): Promise<{ data: { body?: string }[] }>;
}

/** The pull-request calls we use, as Octokit's `octokit.rest.pulls` exposes them. */
export interface GitHubPullsApi {
  create(params: { owner: string; repo: string; title: string; head: string; base: string; body: string }): Promise<{
    data: { html_url: string; number: number };
  }>;
  /** `head` is "owner:branch"; `state: 'open'` */
  list(params: { owner: string; repo: string; head: string; state: 'open' }): Promise<{ data: { html_url: string; number: number }[] }>;
  /** With `mediaType.format: 'diff'` GitHub returns the unified diff as a string in `data`; without it, the pull request. */
  get(params: { owner: string; repo: string; pull_number: number; mediaType: { format: 'diff' } }): Promise<{ data: unknown }>;
  get(params: { owner: string; repo: string; pull_number: number }): Promise<{ data: { state: 'open' | 'closed'; merged: boolean } }>;
  createReview(params: { owner: string; repo: string; pull_number: number; body: string; event: 'COMMENT' }): Promise<unknown>;
}

/** The one commit call the contract run uses to ask GitHub who it attributes a commit to. */
export interface GitHubCommitsApi {
  getCommit(params: { owner: string; repo: string; ref: string }): Promise<{
    /** `author` is the linked account; GitHub returns an empty object or null when the email links to none. */
    data: { author: { login?: string } | null; commit: { author: { name?: string; email?: string } | null } };
  }>;
}

export type RepoRef = Pick<IssueRef, 'owner' | 'repo'>;

export type GitHubRepoClients = {
  issues: GitHubIssuesApi;
  pulls: GitHubPullsApi;
  commits: GitHubCommitsApi;
  /** A token a git remote URL can carry. Fresh enough for one clone or one push; never cache it. */
  gitToken(): Promise<string>;
  /** The identity GitHub attributes commits to: the app's bot user, or the token's user. */
  gitIdentity(): Promise<GitAuthor>;
};

/** Resolves the clients for one repository. With a GitHub App that means the installation that covers it. */
export interface GitHubClients {
  for(ref: RepoRef): Promise<GitHubRepoClients>;
}

/**
 * Clients whose credentials are decided per repository, through `resolve`. One underlying client per
 * distinct credentials (an app id, or a token), so a hundred repositories on one app share its token cache.
 */
export class ResolvingGitHubClients implements GitHubClients {
  private readonly byCredentials = new Map<string, GitHubClients>();

  constructor(
    private readonly resolve: (ref: RepoRef) => Promise<GitHubCredentials>,
    private readonly create: (credentials: GitHubCredentials) => GitHubClients,
  ) {}

  async for(ref: RepoRef): Promise<GitHubRepoClients> {
    const credentials = await this.resolve(ref);
    const key = credentials.type === 'github-app' ? `app:${credentials.appId}` : `token:${createHash('sha256').update(credentials.token).digest('hex')}`;
    let clients = this.byCredentials.get(key);
    if (!clients) {
      clients = this.create(credentials);
      this.byCredentials.set(key, clients);
    }
    return clients.for(ref);
  }
}

/** "owner/name", as a repository profile names it. */
export function parseRepo(repo: string): RepoRef {
  const [owner, name] = repo.split('/');
  if (!owner || !name) throw new Error(`expected owner/name, got "${repo}"`);
  return { owner, repo: name };
}
