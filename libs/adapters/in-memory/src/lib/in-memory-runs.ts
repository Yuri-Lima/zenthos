import type { Run, RunState } from '@zenthos/domain';
import type { RunsPort } from '@zenthos/ports';

export class InMemoryRuns implements RunsPort {
  readonly byId = new Map<string, Run>();

  async save(run: Run): Promise<void> {
    this.byId.set(run.id, run);
  }

  async latest(ticketKey: string): Promise<Run | undefined> {
    return (await this.list()).find((run) => run.ticket.key === ticketKey);
  }

  async list({ state, limit }: { state?: RunState; limit?: number } = {}): Promise<Run[]> {
    const runs = [...this.byId.values()].filter((run) => !state || run.state === state).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return limit ? runs.slice(0, limit) : runs;
  }
}
