import { parseRun, type Run, type RunState } from '@zenthos/domain';
import type { RunsPort } from '@zenthos/ports';

export class InMemoryRuns implements RunsPort {
  readonly byId = new Map<string, Run>();

  async save(run: Run): Promise<void> {
    // parsed like a row read back from Postgres, so both stores answer the same for older runs
    this.byId.set(run.id, parseRun(run));
  }

  async latest(ticketKey: string): Promise<Run | undefined> {
    return (await this.list()).find((run) => run.ticket.key === ticketKey);
  }

  async list({ workspaceId, state, limit }: { workspaceId?: string; state?: RunState; limit?: number } = {}): Promise<Run[]> {
    const runs = [...this.byId.values()]
      .filter((run) => (!workspaceId || run.workspaceId === workspaceId) && (!state || run.state === state))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return limit ? runs.slice(0, limit) : runs;
  }
}
