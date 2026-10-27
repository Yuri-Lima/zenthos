import type { GitHubAppManifestResult, GitHubCredentials, GitHubUser, Installation, RepositoryInfo } from '@zenthos/domain';

/** The GitHub calls that happen outside any repository: finishing a manifest, reading an installation, signing in, checking credentials (ADR 007). */
export interface GitHubAppsPort {
  exchangeManifestCode(code: string): Promise<GitHubAppManifestResult>;
  describeInstallation(credentials: Extract<GitHubCredentials, { type: 'github-app' }>, installationId: number): Promise<Installation>;
  /** Finishes the App's user authorization: the code GitHub sent to the callback becomes the person who signed in. */
  signInUser(app: { clientId: string; clientSecret: string }, code: string, redirectUri: string): Promise<GitHubUser>;
  /** Who the credentials act as: the app's slug, or the token's login. Rejects when GitHub refuses them. */
  whoAmI(credentials: GitHubCredentials): Promise<string>;
  /** Every installation of the app as GitHub lists it now, with its repositories. */
  listInstallations(credentials: Extract<GitHubCredentials, { type: 'github-app' }>): Promise<Installation[]>;
  /** One repository as these credentials see it: default branch and clone URL, for the profile form. `repository_not_found` when they cannot. */
  describeRepository(credentials: GitHubCredentials, repo: string): Promise<RepositoryInfo>;
}
