import { inject, Injectable } from '@angular/core';
import type { paths } from '@zenthos/api-client';
import { API } from './api';

type RunsResponse = paths['/runs']['get']['responses'][200]['content']['application/json'];
/** The run as the API documents it; one type, derived from the OpenAPI document, never hand-written. */
export type Run = Exclude<RunsResponse, readonly unknown[]>;
export type MetricValue = paths['/metrics']['get']['responses'][200]['content']['application/json'][number];

/** Runs, through the generated client. Pages poll these; the API is the source. */
@Injectable({ providedIn: 'root' })
export class RunsService {
  private readonly api = inject(API);

  async list(state?: Run['state']): Promise<Run[]> {
    const { data } = await this.api.GET('/runs', { params: { query: { limit: 100, ...(state ? { state } : {}) } } });
    return Array.isArray(data) ? data : [];
  }

  async byTicket(ticketKey: string): Promise<Run | undefined> {
    const { data, response } = await this.api.GET('/runs', { params: { query: { ticket: ticketKey } } });
    return response.ok && data && !Array.isArray(data) ? data : undefined;
  }

  start(ticketKey: string) {
    return this.api.POST('/runs', { body: { ticketKey } });
  }

  decide(ticketKey: string, decision: 'approved' | 'rejected') {
    return this.api.POST('/runs/decision', { body: { ticketKey, decision } });
  }

  async metrics(): Promise<MetricValue[]> {
    const { data } = await this.api.GET('/metrics');
    return data ?? [];
  }
}
