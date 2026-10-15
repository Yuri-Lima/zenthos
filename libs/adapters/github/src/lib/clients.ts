import type { IssueRef } from './issue-key.js';

type IssueParams = { owner: string; repo: string; issue_number: number };
type Label = string | { name?: string };

/** The three issue calls we use, as Octokit's `octokit.rest.issues` exposes them. A fake fits in a test. */
export interface GitHubIssuesApi {
  get(params: IssueParams): Promise<{ data: { title: string; body?: string | null; html_url: string; labels: Label[] } }>;
  createComment(params: IssueParams & { body: string }): Promise<unknown>;
  listComments(params: IssueParams & { per_page: number }): Promise<{ data: { body?: string }[] }>;
}

/** The one pull-request call we use, as Octokit's `octokit.rest.pulls` exposes it. */
export interface GitHubPullsApi {
  create(params: { owner: string; repo: string; title: string; head: string; base: string; body: string }): Promise<{
    data: { html_url: string; number: number };
  }>;
}

export type RepoRef = Pick<IssueRef, 'owner' | 'repo'>;

export type GitHubRepoClients = {
  issues: GitHubIssuesApi;
  pulls: GitHubPullsApi;
  /** A token a git remote URL can carry. Fresh enough for one clone or one push; never cache it. */
  gitToken(): Promise<string>;
};

/** Resolves the clients for one repository. With a GitHub App that means the installation that covers it. */
export interface GitHubClients {
  for(ref: RepoRef): Promise<GitHubRepoClients>;
}

/** "owner/name", as a repository profile names it. */
export function parseRepo(repo: string): RepoRef {
  const [owner, name] = repo.split('/');
  if (!owner || !name) throw new Error(`expected owner/name, got "${repo}"`);
  return { owner, repo: name };
}
