import { existsSync } from 'node:fs';
import { TemporalRunControl } from '@zenthos/adapter-temporal';
import { WORKFLOW_CONTRACT } from '@zenthos/domain';

const USAGE = `zenthos <command> <ticket-key>
  run      start a run for the ticket (owner/repo#123)
  approve  approve the current spec draft
  reject   ask for a new spec draft
  state    print the run as the workflow sees it
Environment: TEMPORAL_ADDRESS (localhost:7233), TEMPORAL_NAMESPACE (default), TEMPORAL_TASK_QUEUE (zenthos)`;

async function main([command, key]: string[]) {
  if (existsSync('.env')) process.loadEnvFile('.env');
  if (!command || !key) {
    console.log(USAGE);
    process.exit(command ? 1 : 0);
  }
  const runs = await TemporalRunControl.connect({
    address: process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233',
    namespace: process.env['TEMPORAL_NAMESPACE'] ?? 'default',
    taskQueue: process.env['TEMPORAL_TASK_QUEUE'] ?? WORKFLOW_CONTRACT.defaultTaskQueue,
  });
  try {
    switch (command) {
      case 'run':
        console.log(JSON.stringify(await runs.start(key)));
        return;
      case 'approve':
      case 'reject':
        await runs.decide(key, command === 'approve' ? 'approved' : 'rejected');
        console.log(JSON.stringify({ ticketKey: key, signalled: command }));
        return;
      case 'state':
        console.log(JSON.stringify(await runs.state(key), null, 2));
        return;
      default:
        console.log(USAGE);
        process.exit(1);
    }
  } finally {
    await runs.close();
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
