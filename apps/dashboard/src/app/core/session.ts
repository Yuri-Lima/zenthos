import { inject, Injectable, signal } from '@angular/core';
import { can, type WorkspaceAction } from '@zenthos/domain';
import type { paths } from '@zenthos/api-client';
import { API } from './api';

export type User = paths['/auth/me']['get']['responses'][200]['content']['application/json'];

/**
 * Who is signed in and in which workspace, asked once from the API; `null` when nobody, `anonymous` when the API
 * runs without sign-in (then everything happens in the dry-run workspace).
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(API);
  readonly user = signal<User | null | undefined>(undefined);

  async load(): Promise<User | null> {
    const { data, response } = await this.api.GET('/auth/me');
    const user = response.ok && data ? data : null;
    this.user.set(user);
    return user;
  }

  /**
   * Whether the signed-in person may do this in the current workspace. The API decides for real; this only hides
   * controls that would be refused. Before the session is known, nothing is hidden.
   */
  can(action: WorkspaceAction): boolean {
    const user = this.user();
    if (!user || user.anonymous) return true;
    return user.workspace ? can(user.workspace.role, action) : false;
  }

  async logout(): Promise<void> {
    await this.api.POST('/auth/logout');
    this.user.set(null);
  }
}
