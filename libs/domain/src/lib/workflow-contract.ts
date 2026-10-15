/**
 * The names the worker and every client (CLI, API) agree on. Defined once here; the worker's workflow
 * function and handlers are declared from these, and clients address the workflow with them.
 */
export const WORKFLOW_CONTRACT = {
  workflowType: 'ticketRunWorkflow',
  defaultTaskQueue: 'zenthos',
  approvalSignal: 'approvalDecision',
  runQuery: 'run',
  workflowId: (ticketKey: string) => `ticket:${ticketKey}`,
} as const;
