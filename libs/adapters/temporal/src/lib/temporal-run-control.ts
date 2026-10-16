import { Client, Connection, WorkflowExecutionAlreadyStartedError, WorkflowNotFoundError } from '@temporalio/client';
import { WORKFLOW_CONTRACT, type Run } from '@zenthos/domain';
import type { RunControlPort } from '@zenthos/ports';

export type TemporalConfig = { address: string; namespace: string; taskQueue: string };

/** Drives ticket runs through the Temporal client; the only place outside the worker that names the workflow. */
export class TemporalRunControl implements RunControlPort {
  private constructor(
    private readonly client: Client,
    private readonly connection: Connection,
    private readonly taskQueue: string,
  ) {}

  static async connect({ address, namespace, taskQueue }: TemporalConfig): Promise<TemporalRunControl> {
    const connection = await Connection.connect({ address });
    return new TemporalRunControl(new Client({ connection, namespace }), connection, taskQueue);
  }

  async start(ticketKey: string): Promise<{ workflowId: string }> {
    const workflowId = WORKFLOW_CONTRACT.workflowId(ticketKey);
    try {
      await this.client.workflow.start(WORKFLOW_CONTRACT.workflowType, { taskQueue: this.taskQueue, workflowId, args: [{ key: ticketKey }] });
    } catch (error) {
      // A run already in flight for this ticket is the idempotent answer, not a failure.
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
    }
    return { workflowId };
  }

  async decide(ticketKey: string, decision: 'approved' | 'rejected'): Promise<void> {
    await this.client.workflow.getHandle(WORKFLOW_CONTRACT.workflowId(ticketKey)).signal(WORKFLOW_CONTRACT.approvalSignal, decision);
  }

  async state(ticketKey: string): Promise<Run | undefined> {
    try {
      return await this.client.workflow.getHandle(WORKFLOW_CONTRACT.workflowId(ticketKey)).query<Run>(WORKFLOW_CONTRACT.runQuery);
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) return undefined;
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.connection.close();
  }
}
