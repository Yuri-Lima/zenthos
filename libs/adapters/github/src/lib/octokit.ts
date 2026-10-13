import { Octokit } from '@octokit/rest';
import { GitHubIssueTracker } from './github-issue-tracker.js';

/** The production wiring. Kept apart from the tracker so tests never load Octokit (ESM only). */
export function createGitHubIssueTracker(token: string): GitHubIssueTracker {
  return new GitHubIssueTracker(new Octokit({ auth: token }).rest.issues);
}
