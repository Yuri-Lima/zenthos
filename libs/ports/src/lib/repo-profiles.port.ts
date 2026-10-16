import type { RepoProfile } from '@zenthos/domain';

/** Where repository profiles live (ADR 006). The worker reads; the API writes. */
export interface RepoProfilesPort {
  get(repo: string): Promise<RepoProfile | undefined>;
  list(): Promise<RepoProfile[]>;
  save(profile: RepoProfile): Promise<void>;
  remove(repo: string): Promise<void>;
}
