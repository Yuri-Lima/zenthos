import { DomainError, repoOfTicket, type RepoProfile } from '@zenthos/domain';
import type { RepoProfilesPort } from '@zenthos/ports';

/** The profile a ticket's repository has, or `unknown_repository`: the pipeline never acts on a repository nobody configured. */
export async function profileForTicket(profiles: RepoProfilesPort, key: string): Promise<RepoProfile> {
  const profile = await profiles.get(repoOfTicket(key));
  if (!profile) throw new DomainError('unknown_repository', { key });
  return profile;
}
