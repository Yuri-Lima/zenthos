import { inject, Injectable, signal } from '@angular/core';
import { API } from './api';

export type User = { login: string; avatarUrl?: string; anonymous?: boolean };

/** Who is signed in, asked once from the API; `null` when nobody, `anonymous` when the API runs without sign-in. */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(API);
  readonly user = signal<User | null | undefined>(undefined);

  async load(): Promise<User | null> {
    const { data, response } = await this.api.GET('/auth/me');
    const user = response.ok && data ? (data as User) : null;
    this.user.set(user);
    return user;
  }

  async logout(): Promise<void> {
    await this.api.POST('/auth/logout');
    this.user.set(null);
  }
}
