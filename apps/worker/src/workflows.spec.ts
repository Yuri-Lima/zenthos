import path from 'node:path';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { APPROVAL_LABELS, createRun, fail, pass, WORKFLOW_CONTRACT, type Approval, type GateResult, type Run, type Ticket, type Workspace } from '@zenthos/domain';
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
const workspace: Workspace = { id: 'w', path: '/tmp/w', repo: 'owner/repo', baseBranch: 'staging', branch: 'zenthos/owner-repo-1' };

function fakeActivities(options: { approvals?: Approval[]; failDraftsBeforeSuccess?: number; failingGateRounds?: number; costBreach?: boolean; baselineFailures?: string[] } = {}) {
  const approvals = [...(options.approvals ?? [])];
  let draftFailures = options.failDraftsBeforeSuccess ?? 0;
  let failingGates = options.failingGateRounds ?? 0;
  const calls = { intake: 0, draftSpec: 0, readApproval: 0, implement: 0, runGates: 0, openPullRequest: 0, cleanup: 0, pushed: 0, feedback: [] as (string | undefined)[], baselines: [] as string[][] };
  const activities: Activities = {
    prepare: async () => workspace,
    baseline: async () => options.baselineFailures ?? [],
    implement: async (_run, _workspace, feedback) => {
      calls.implement++;
      calls.feedback.push(feedback);
      return {
        implementation: { summary: 'did it', estimatedCostUsd: 0.5, tokens: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 } },
        diff: { files: ['src/a.ts'], changedLines: 12, patch: '+a' },
      };
    },
    runGates: async (_run, _workspace, _diff, baselineFailures): Promise<GateResult[]> => {
      calls.runGates++;
      calls.baselines.push(baselineFailures);
      if (options.costBreach) return [pass('secret_scan'), fail('cost_ceiling', 'spent 7.3 USD, ceiling is 5 USD')];
      return failingGates-- > 0 ? [pass('secret_scan'), fail('ci', 'lint exited 1')] : [pass('secret_scan'), pass('ci')];
    },
    pushWorkInProgress: async (_run, ws) => {
      calls.pushed++;
      return ws.branch;
    },
    openPullRequest: async () => {
      calls.openPullRequest++;
      return { url: 'https://github.com/owner/repo/pull/9', number: 9 };
    },
    cleanup: async () => {
      calls.cleanup++;
    },
    gateFeedback: async (gates) => gates.filter((g) => !g.passed).map((g) => `${g.gate}: ${g.detail}`).join('\n'),
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
  it('is registered under the name the contract promises clients', () => {
    expect(ticketRunWorkflow.name).toBe(WORKFLOW_CONTRACT.workflowType);
  });

  let env: TestWorkflowEnvironment;
  const taskQueue = 'test';
  // Jest runs with the project root as cwd; main.ts resolves the same file from import.meta.url.
  const workflowsPath = path.join(process.cwd(), 'src', 'workflows.ts');
  const input = (key: string): TicketRunInput => ({ key, approval: { pollSeconds: 60, timeoutHours: 1, maxDraftRounds: 2 }, maxImplementRounds: 2 });

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

  it('opens a merge request after the label appears and the gates pass', async () => {
    const { activities, calls } = fakeActivities({ approvals: ['pending', 'approved'] });
    const run = await runWith(activities, 'label');
    expect(run.state).toBe('mr_opened');
    expect(run.spec?.acceptanceCriteria[0].id).toBe('AC-1');
    expect(run.pullRequestUrl).toBe('https://github.com/owner/repo/pull/9');
    expect(run.estimatedCostUsd).toBe(0.5);
    expect(run.tokens.inputTokens).toBe(1000);
    expect(run.history.map((h) => h.event)).toEqual(['spec_drafted', 'spec_approved', 'implemented', 'gates_passed', 'mr_opened']);
    expect(calls.readApproval).toBe(2);
    expect(calls.cleanup).toBe(1);
    expect(APPROVAL_LABELS.approved).toBeDefined();
  });

  it('approves on a signal without polling', async () => {
    const { activities, calls } = fakeActivities();
    const run = await runWith(activities, 'signal', 'approved');
    expect(run.state).toBe('mr_opened');
    expect(calls.readApproval).toBe(0);
  });

  it('retries the implementation once in the same workspace with the gate feedback, then escalates with the branch pushed', async () => {
    const { activities, calls } = fakeActivities({ approvals: ['approved'], failingGateRounds: 2 });
    const run = await runWith(activities, 'gates');
    expect(run.state).toBe('needs_human');
    expect(calls.implement).toBe(2);
    expect(calls.feedback).toEqual([undefined, 'ci: lint exited 1']);
    expect(calls.openPullRequest).toBe(0);
    expect(calls.pushed).toBe(1);
    expect(calls.cleanup).toBe(1);
    expect(run.branch).toBe(workspace.branch);
    expect(run.history.map((h) => h.event)).toEqual(['spec_drafted', 'spec_approved', 'implemented', 'gates_failed', 'implemented', 'escalated']);
  });

  it('hands the baseline failures to the gates', async () => {
    const { activities, calls } = fakeActivities({ approvals: ['approved'], baselineFailures: ['bun run format:check'] });
    const run = await runWith(activities, 'baseline');
    expect(run.state).toBe('mr_opened');
    expect(calls.baselines).toEqual([['bun run format:check']]);
  });

  it('escalates at once on a cost ceiling breach, without a second implementation', async () => {
    const { activities, calls } = fakeActivities({ approvals: ['approved'], costBreach: true });
    const run = await runWith(activities, 'cost');
    expect(run.state).toBe('needs_human');
    expect(calls.implement).toBe(1);
    expect(calls.pushed).toBe(1);
    expect(run.history.map((h) => h.event)).toEqual(['spec_drafted', 'spec_approved', 'implemented', 'escalated']);
  });

  it('opens the merge request when the second implementation passes the gates', async () => {
    const { activities, calls } = fakeActivities({ approvals: ['approved'], failingGateRounds: 1 });
    const run = await runWith(activities, 'gates-retry');
    expect(run.state).toBe('mr_opened');
    expect(calls.implement).toBe(2);
    expect(run.estimatedCostUsd).toBe(1);
    expect(run.tokens.outputTokens).toBe(400);
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
    expect(run.state).toBe('mr_opened');
    expect(calls.draftSpec).toBe(2);
  });
});
