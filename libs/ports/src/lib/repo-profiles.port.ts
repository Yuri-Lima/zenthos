import type { RepoProfile } from '@zenthos/domain';

/** Where repository profiles live (ADR 006). The worker reads; the API writes. A repository belongs to one workspace (ADR 019). */
export interface RepoProfilesPort {
  get(repo: string): Promise<RepoProfile | undefined>;
  list(workspaceId: string): Promise<RepoProfile[]>;
  save(profile: RepoProfile): Promise<void>;
  remove(repo: string): Promise<void>;
}
