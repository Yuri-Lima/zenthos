import type { GitHubAppsPort, ProviderConnectionsPort, RepoProfilesPort, RunControlPort } from '@zenthos/ports';

/** The ports the controllers use; one object, one injection token. Built by composition.ts. */
export type ApiPorts = {
  connections: ProviderConnectionsPort;
  profiles: RepoProfilesPort;
  runs: RunControlPort;
  githubApps: GitHubAppsPort;
  close(): Promise<void>;
};

export const API_PORTS = 'ApiPorts';
