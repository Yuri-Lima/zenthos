import { inject, Injectable } from '@angular/core';
import type { paths } from '@zenthos/api-client';
import { API } from './api';

/** Every type here is derived from the OpenAPI document; none is written by hand. */
export type MyWorkspace = paths['/workspaces']['get']['responses'][200]['content']['application/json'][number];
export type Member = paths['/workspaces/{id}/members']['get']['responses'][200]['content']['application/json'][number];
export type Role = Member['role'];

/** The API answers a refused change with the domain's message; undefined means it went through. */
async function failure(call: Promise<{ error?: unknown; response: Response }>): Promise<string | undefined> {
  const { error, response } = await call;
  if (response.ok) return undefined;
  return (error as { message?: string } | undefined)?.message ?? response.statusText;
}

/** Workspaces and members (ADR 019), through the generated client. */
@Injectable({ providedIn: 'root' })
export class WorkspacesService {
  private readonly api = inject(API);

  async mine(): Promise<MyWorkspace[]> {
    const { data } = await this.api.GET('/workspaces');
    return data ?? [];
  }

  create(name: string) {
    return failure(this.api.POST('/workspaces', { body: { name } }));
  }

  select(id: string) {
    return failure(this.api.POST('/workspaces/{id}/select', { params: { path: { id } } }));
  }

  async members(id: string): Promise<Member[]> {
    const { data } = await this.api.GET('/workspaces/{id}/members', { params: { path: { id } } });
    return data ?? [];
  }

  setMember(id: string, login: string, role: Role) {
    return failure(this.api.PUT('/workspaces/{id}/members/{login}', { params: { path: { id, login } }, body: { role } }));
  }

  removeMember(id: string, login: string) {
    return failure(this.api.DELETE('/workspaces/{id}/members/{login}', { params: { path: { id, login } } }));
  }
}
