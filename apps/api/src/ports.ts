import type { GitHubAppsPort, ProviderConnectionsPort, RepoProfilesPort, RunControlPort, RunsPort } from '@zenthos/ports';

/** The ports the controllers use; one object, one injection token. Built by composition.ts. */
export type ApiPorts = {
  connections: ProviderConnectionsPort;
  profiles: RepoProfilesPort;
  runs: RunControlPort;
  /** The stored projection of runs; what the list and detail endpoints serve (ADR 011). */
  runStore: RunsPort;
  githubApps: GitHubAppsPort;
  close(): Promise<void>;
};

export const API_PORTS = 'ApiPorts';
