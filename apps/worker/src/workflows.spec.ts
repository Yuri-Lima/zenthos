import path from 'node:path';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { APPROVAL_LABELS, createRun, type Approval, type Run, type Ticket } from '@zenthos/domain';
import type { Activities } from './activities.js';
import { bundlerOptions } from './bundler.js';
import { approvalDecisionSignal, ticketRunWorkflow, type TicketRunInput } from './workflows.js';

jest.setTimeout(120_000);

const ticket: Ticket = {
  key: 'owner/repo#1',
  title: 'Add CSV export',
  body: '',
  url: 'https://github.com/owner/repo/issues/1',
  labels: [],
};

/** Activities as the workflow sees them, with knobs for what the "human" and the "model" do. */
function fakeActivities(options: { approvals?: Approval[]; failDraftsBeforeSuccess?: number } = {}) {
  const approvals = [...(options.approvals ?? [])];
  let draftFailures = options.failDraftsBeforeSuccess ?? 0;
  const calls = { intake: 0, draftSpec: 0, readApproval: 0 };
  const activities: Activities = {
    intake: async (key) => {
      calls.intake++;
      return createRun({ ...ticket, key });
    },
    draftSpec: async (run: Run) => {
      calls.draftSpec++;
      if (draftFailures-- > 0) throw new Error('model timed out');
      return {
        ticketKey: run.ticket.key,
        problem: 'Users cannot export the list',
        inScope: ['CSV export'],
        outOfScope: [],
        acceptanceCriteria: [{ id: 'AC-1', statement: 'Export downloads a CSV with every visible row', testHint: 'Playwright' }],
        touchedAreas: ['src/routes/list'],
        risks: [],
      };
    },
    readApproval: async () => {
      calls.readApproval++;
      return approvals.shift() ?? 'pending';
    },
  };
  return { activities, calls };
}

describe('ticketRunWorkflow', () => {
  let env: TestWorkflowEnvironment;
  const taskQueue = 'test';
  // Jest runs with the project root as cwd; main.ts resolves the same file from import.meta.url.
  const workflowsPath = path.join(process.cwd(), 'src', 'workflows.ts');
  const input = (key: string): TicketRunInput => ({ key, approval: { pollSeconds: 60, timeoutHours: 1, maxDraftRounds: 2 } });

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await env?.teardown();
  });

  async function runWith(activities: Activities, key: string, signal?: 'approved' | 'rejected') {
    const worker = await Worker.create({ connection: env.nativeConnection, taskQueue, workflowsPath, activities, bundlerOptions });
    const options = { taskQueue, workflowId: key, args: [input(key)] as [TicketRunInput] };
    return worker.runUntil(async () => {
      // Time skipping runs the workflow faster than a separate signal call could land, so the
      // signal rides along with the start; Temporal buffers it until the handler is set.
      const handle = signal
        ? await env.client.workflow.signalWithStart(ticketRunWorkflow, { ...options, signal: approvalDecisionSignal, signalArgs: [signal] })
        : await env.client.workflow.start(ticketRunWorkflow, options);
      return handle.result();
    });
  }

  it('reaches spec_approved when the label appears', async () => {
    const { activities, calls } = fakeActivities({ approvals: ['pending', 'approved'] });
    const run = await runWith(activities, 'label');
    expect(run.state).toBe('spec_approved');
    expect(run.spec?.acceptanceCriteria[0].id).toBe('AC-1');
    expect(calls.readApproval).toBe(2);
    expect(APPROVAL_LABELS.approved).toBeDefined();
  });

  it('reaches spec_approved on a signal without polling', async () => {
    const { activities, calls } = fakeActivities();
    const run = await runWith(activities, 'signal', 'approved');
    expect(run.state).toBe('spec_approved');
    expect(calls.readApproval).toBe(0);
  });

  it('redrafts once after a rejection, then escalates', async () => {
    const { activities, calls } = fakeActivities({ approvals: ['rejected', 'rejected'] });
    const run = await runWith(activities, 'rejected');
    expect(run.state).toBe('needs_human');
    expect(calls.draftSpec).toBe(2);
    expect(run.history.map((h) => h.event)).toEqual(['spec_drafted', 'spec_rejected', 'spec_drafted', 'spec_rejected', 'escalated']);
  });

  it('escalates when nobody decides before the timeout', async () => {
    const { activities, calls } = fakeActivities();
    const run = await runWith(activities, 'timeout');
    expect(run.state).toBe('needs_human');
    expect(calls.readApproval).toBe(60);
  });

  it('retries a failed draft activity and still completes', async () => {
    const { activities, calls } = fakeActivities({ approvals: ['approved'], failDraftsBeforeSuccess: 1 });
    const run = await runWith(activities, 'retry');
    expect(run.state).toBe('spec_approved');
    expect(calls.draftSpec).toBe(2);
  });
});
