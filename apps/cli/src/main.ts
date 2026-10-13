import { existsSync } from 'node:fs';
import { Client, Connection } from '@temporalio/client';
import type { Run } from '@zenthos/domain';

const USAGE = `zenthos <command> <ticket-key>
  run      start a run for the ticket (owner/repo#123)
  approve  approve the current spec draft
  reject   ask for a new spec draft
  state    print the run as the workflow sees it
Environment: TEMPORAL_ADDRESS (localhost:7233), TEMPORAL_NAMESPACE (default), TEMPORAL_TASK_QUEUE (zenthos)`;

/** Workflow names and ids are the contract with the worker; see apps/worker/src/workflows.ts. */
const WORKFLOW = 'ticketRunWorkflow';
const workflowId = (key: string) => `ticket:${key}`;

async function main([command, key]: string[]) {
  if (existsSync('.env')) process.loadEnvFile('.env');
  if (!command || !key) {
    console.log(USAGE);
    process.exit(command ? 1 : 0);
  }
  const connection = await Connection.connect({ address: process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233' });
  const client = new Client({ connection, namespace: process.env['TEMPORAL_NAMESPACE'] ?? 'default' });
  try {
    switch (command) {
      case 'run': {
        const handle = await client.workflow.start(WORKFLOW, {
          taskQueue: process.env['TEMPORAL_TASK_QUEUE'] ?? 'zenthos',
          workflowId: workflowId(key),
          args: [{ key }],
        });
        console.log(JSON.stringify({ workflowId: handle.workflowId, runId: handle.firstExecutionRunId }));
        return;
      }
      case 'approve':
      case 'reject':
        await client.workflow.getHandle(workflowId(key)).signal('approvalDecision', command === 'approve' ? 'approved' : 'rejected');
        console.log(JSON.stringify({ workflowId: workflowId(key), signalled: command }));
        return;
      case 'state': {
        const run = await client.workflow.getHandle(workflowId(key)).query<Run>('run');
        console.log(JSON.stringify(run, null, 2));
        return;
      }
      default:
        console.log(USAGE);
        process.exit(1);
    }
  } finally {
    await connection.close();
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
