import type { ProviderConnection, RepoProfile } from '@zenthos/domain';
import type { ProviderConnectionsPort, RepoProfilesPort } from '@zenthos/ports';

/** Connections kept in a map; for tests and for a worker that still takes credentials from the environment. */
export class InMemoryProviderConnections implements ProviderConnectionsPort {
  private readonly byId = new Map<string, ProviderConnection>();

  async get(id: string): Promise<ProviderConnection | undefined> {
    return this.byId.get(id);
  }

  async findByAppId(appId: string): Promise<ProviderConnection | undefined> {
    return [...this.byId.values()].find((c) => c.credentials.type === 'github-app' && c.credentials.appId === appId);
  }

  async platformApp(): Promise<ProviderConnection | undefined> {
    return [...this.byId.values()].find((c) => !c.workspaceId && c.credentials.type === 'github-app');
  }

  async list(workspaceId: string): Promise<ProviderConnection[]> {
    return [...this.byId.values()].filter((c) => c.workspaceId === workspaceId);
  }

  async save(connection: ProviderConnection): Promise<void> {
    this.byId.set(connection.id, connection);
  }

  async remove(id: string): Promise<void> {
    this.byId.delete(id);
  }
}

/** Profiles kept in a map, seeded from code; the dry-run default. */
export class InMemoryRepoProfiles implements RepoProfilesPort {
  private readonly byRepo = new Map<string, RepoProfile>();

  constructor(seed: RepoProfile[] = []) {
    for (const profile of seed) this.byRepo.set(profile.repo, profile);
  }

  async get(repo: string): Promise<RepoProfile | undefined> {
    return this.byRepo.get(repo);
  }

  async list(workspaceId: string): Promise<RepoProfile[]> {
    return [...this.byRepo.values()].filter((p) => p.workspaceId === workspaceId);
  }

  async save(profile: RepoProfile): Promise<void> {
    this.byRepo.set(profile.repo, profile);
  }

  async remove(repo: string): Promise<void> {
    this.byRepo.delete(repo);
  }
}
