import { inject, Injectable } from '@angular/core';
import type { paths } from '@zenthos/api-client';
import { API } from './api';

/** Every type here is derived from the OpenAPI document; none is written by hand. */
export type Connection = paths['/providers']['get']['responses'][200]['content']['application/json'][number];
export type ConnectionCheck = paths['/providers/{id}/check']['post']['responses'][200]['content']['application/json'];
export type Profile = paths['/repos']['get']['responses'][200]['content']['application/json'][number];
export type ProfileBody = NonNullable<paths['/repos/{owner}/{name}']['put']['requestBody']>['content']['application/json'];
export type AppBody = NonNullable<paths['/providers/github/app']['post']['requestBody']>['content']['application/json'];
export type TokenBody = NonNullable<paths['/providers/github/token']['post']['requestBody']>['content']['application/json'];

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

/** Provider connections and repository profiles (ADR 010), through the generated client. */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly api = inject(API);

  async connections(): Promise<Connection[]> {
    const { data } = await this.api.GET('/providers');
    return data ?? [];
  }

  async profiles(): Promise<Profile[]> {
    const { data } = await this.api.GET('/repos');
    return data ?? [];
  }

  async check(id: string): Promise<ConnectionCheck | undefined> {
    const { data } = await this.api.POST('/providers/{id}/check', { params: { path: { id } } });
    return data;
  }

  connectToken(body: TokenBody) {
    return failure(this.api.POST('/providers/github/token', { body }));
  }

  connectApp(body: AppBody) {
    return failure(this.api.POST('/providers/github/app', { body }));
  }

  removeConnection(id: string) {
    return failure(this.api.DELETE('/providers/{id}', { params: { path: { id } } }));
  }

  saveProfile(repo: string, body: ProfileBody) {
    return failure(this.api.PUT('/repos/{owner}/{name}', { params: { path: pathOf(repo) }, body }));
  }

  removeProfile(repo: string) {
    return failure(this.api.DELETE('/repos/{owner}/{name}', { params: { path: pathOf(repo) } }));
  }
}
