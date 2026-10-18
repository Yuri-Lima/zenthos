import { createRun, type Run } from '@zenthos/domain';
import type { RunControlPort } from '@zenthos/ports';

/** Records starts and decisions instead of talking to Temporal. */
export class InMemoryRunControl implements RunControlPort {
  readonly runs = new Map<string, Run>();
  readonly decisions: { ticketKey: string; decision: 'approved' | 'rejected'; actor?: string }[] = [];

  async start(ticketKey: string, actor?: string): Promise<{ workflowId: string }> {
    if (!this.runs.has(ticketKey)) this.runs.set(ticketKey, createRun({ key: ticketKey, title: ticketKey, body: '', url: `https://example.test/${ticketKey}`, labels: [] }, { requestedBy: actor }));
    return { workflowId: `ticket:${ticketKey}` };
  }

  async decide(ticketKey: string, decision: 'approved' | 'rejected', actor?: string): Promise<void> {
    this.decisions.push({ ticketKey, decision, ...(actor ? { actor } : {}) });
  }

  async state(ticketKey: string): Promise<Run | undefined> {
    return this.runs.get(ticketKey);
  }
}
