import type { GitHubAppManifestResult, GitHubCredentials, Installation } from '@zenthos/domain';

/** The two GitHub calls that happen outside any repository: finishing a manifest, reading an installation (ADR 007). */
export interface GitHubAppsPort {
  exchangeManifestCode(code: string): Promise<GitHubAppManifestResult>;
  describeInstallation(credentials: Extract<GitHubCredentials, { type: 'github-app' }>, installationId: number): Promise<Installation>;
}
