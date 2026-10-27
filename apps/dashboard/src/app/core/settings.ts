import { inject, Injectable } from '@angular/core';
import type { paths } from '@zenthos/api-client';
import { API } from './api';

/** Every type here is derived from the OpenAPI document; none is written by hand. */
export type PlatformStatus = paths['/platform']['get']['responses'][200]['content']['application/json'];
export type Installation = paths['/github/installations']['get']['responses'][200]['content']['application/json'][number];
export type RepositoryInfo = paths['/github/repositories/{owner}/{name}']['get']['responses'][200]['content']['application/json'];
export type Profile = paths['/repos']['get']['responses'][200]['content']['application/json'][number];
export type ProfileBody = NonNullable<paths['/repos/{owner}/{name}']['put']['requestBody']>['content']['application/json'];

/** The API answers a refused change with the domain's message; undefined means it went through. */
async function failure(call: Promise<{ error?: unknown; response: Response }>): Promise<string | undefined> {
  const { error, response } = await call;
  if (response.ok) return undefined;
  return (error as { message?: string } | undefined)?.message ?? response.statusText;
}

const pathOf = (repo: string) => {
  const [owner, name] = repo.split('/');
  return { owner, name };
};

/** The platform app, the installations this workspace has claimed, and repository profiles (ADR 010, ADR 019), through the generated client. */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly api = inject(API);

  async platform(): Promise<PlatformStatus | undefined> {
    const { data } = await this.api.GET('/platform');
    return data;
  }

  async installations(): Promise<Installation[]> {
    const { data } = await this.api.GET('/github/installations');
    return data ?? [];
  }

  releaseInstallation(installationId: number) {
    return failure(this.api.DELETE('/github/installations/{id}', { params: { path: { id: String(installationId) } } }));
  }

  /** The repository as GitHub sees it through one of the workspace's installations; undefined when none covers it. */
  async describeRepository(repo: string): Promise<RepositoryInfo | undefined> {
    const { data } = await this.api.GET('/github/repositories/{owner}/{name}', { params: { path: pathOf(repo) } });
    return data;
  }

  async profiles(): Promise<Profile[]> {
    const { data } = await this.api.GET('/repos');
    return data ?? [];
  }

  saveProfile(repo: string, body: ProfileBody) {
    return failure(this.api.PUT('/repos/{owner}/{name}', { params: { path: pathOf(repo) }, body }));
  }

  removeProfile(repo: string) {
    return failure(this.api.DELETE('/repos/{owner}/{name}', { params: { path: pathOf(repo) } }));
  }
}
