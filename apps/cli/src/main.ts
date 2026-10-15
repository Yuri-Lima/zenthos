import { existsSync } from 'node:fs';
import { Client, Connection } from '@temporalio/client';
import { WORKFLOW_CONTRACT, type Run } from '@zenthos/domain';

const USAGE = `zenthos <command> <ticket-key>
  run      start a run for the ticket (owner/repo#123)
  approve  approve the current spec draft
  reject   ask for a new spec draft
  state    print the run as the workflow sees it
Environment: TEMPORAL_ADDRESS (localhost:7233), TEMPORAL_NAMESPACE (default), TEMPORAL_TASK_QUEUE (zenthos)`;

const { workflowType, approvalSignal, runQuery, workflowId, defaultTaskQueue } = WORKFLOW_CONTRACT;

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
        const handle = await client.workflow.start(workflowType, {
          taskQueue: process.env['TEMPORAL_TASK_QUEUE'] ?? defaultTaskQueue,
          workflowId: workflowId(key),
          args: [{ key }],
        });
        console.log(JSON.stringify({ workflowId: handle.workflowId, runId: handle.firstExecutionRunId }));
        return;
      }
      case 'approve':
      case 'reject':
        await client.workflow.getHandle(workflowId(key)).signal(approvalSignal, command === 'approve' ? 'approved' : 'rejected');
        console.log(JSON.stringify({ workflowId: workflowId(key), signalled: command }));
        return;
      case 'state': {
        const run = await client.workflow.getHandle(workflowId(key)).query<Run>(runQuery);
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
