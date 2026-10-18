import type { GitHubAppManifestResult, GitHubCredentials, GitHubUser, Installation } from '@zenthos/domain';

/** The two GitHub calls that happen outside any repository: finishing a manifest, reading an installation (ADR 007). */
export interface GitHubAppsPort {
  exchangeManifestCode(code: string): Promise<GitHubAppManifestResult>;
  describeInstallation(credentials: Extract<GitHubCredentials, { type: 'github-app' }>, installationId: number): Promise<Installation>;
  /** Finishes the App's user authorization: the code GitHub sent to the callback becomes the person who signed in. */
  signInUser(app: { clientId: string; clientSecret: string }, code: string, redirectUri: string): Promise<GitHubUser>;
}
