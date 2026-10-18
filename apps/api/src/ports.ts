import { InMemoryGitHubApps, InMemoryProviderConnections, InMemoryRepoProfiles, InMemoryRunControl, InMemoryRuns, InMemorySessions } from '@zenthos/adapter-in-memory';
import type { GitHubAppsPort, ProviderConnectionsPort, RepoProfilesPort, RunControlPort, RunsPort, SessionsPort } from '@zenthos/ports';

/** The ports the controllers use; one object, one injection token. Built by composition.ts. */
export type ApiPorts = {
  connections: ProviderConnectionsPort;
  profiles: RepoProfilesPort;
  runs: RunControlPort;
  /** The stored projection of runs; what the list and detail endpoints serve (ADR 011). */
  runStore: RunsPort;
  githubApps: GitHubAppsPort;
  sessions: SessionsPort;
  close(): Promise<void>;
};

export const API_PORTS = 'ApiPorts';

/** Every port in memory: the dry run, the OpenAPI writer and the tests. Loads no Octokit, so Jest can import it. */
export const inMemoryPorts = (): ApiPorts => ({
  connections: new InMemoryProviderConnections(),
  profiles: new InMemoryRepoProfiles(),
  runs: new InMemoryRunControl(),
  runStore: new InMemoryRuns(),
  githubApps: new InMemoryGitHubApps(),
  sessions: new InMemorySessions(),
  close: async () => undefined,
});
