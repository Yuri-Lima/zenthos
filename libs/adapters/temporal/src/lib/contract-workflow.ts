import { condition, defineQuery, defineSignal, setHandler, uuid4 } from '@temporalio/workflow';
import { createRun, WORKFLOW_CONTRACT, type Run } from '@zenthos/domain';

/**
 * The smallest workflow that honours WORKFLOW_CONTRACT: answers the run query and ends on the approval
 * signal. Registered under the contract's workflow type so the adapter's contract test needs no worker code.
 */
const approvalSignal = defineSignal<['approved' | 'rejected', string?]>(WORKFLOW_CONTRACT.approvalSignal);
const runQuery = defineQuery<Run>(WORKFLOW_CONTRACT.runQuery);

export async function contractWorkflow({ key, requestedBy }: { key: string; requestedBy?: string }): Promise<Run> {
  const run = createRun({ key, title: key, body: '', url: `https://example.test/${key}`, labels: [] }, { now: new Date(0), id: uuid4(), requestedBy });
  let decided = false;
  setHandler(approvalSignal, () => {
    decided = true;
  });
  setHandler(runQuery, () => run);
  await condition(() => decided);
  return run;
}

export { contractWorkflow as ticketRunWorkflow };
