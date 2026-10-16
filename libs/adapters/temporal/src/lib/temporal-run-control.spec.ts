import path from 'node:path';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { runControlContract } from '@zenthos/ports';
import { bundlerOptions } from './bundler.js';
import { TemporalRunControl } from './temporal-run-control.js';

describe('TemporalRunControl', () => {
  let env: TestWorkflowEnvironment;
  let runs: TemporalRunControl;

  beforeAll(async () => {
    // The time-skipping server is the one the worker tests already cache; this contract needs no real clock.
    env = await TestWorkflowEnvironment.createTimeSkipping();
    runs = await TemporalRunControl.connect({ address: env.connection.options.address as string, namespace: 'default', taskQueue: 'contract' });
  }, 120_000);

  afterAll(async () => {
    await runs?.close();
    await env?.teardown();
  });

  for (const [name, check] of Object.entries(runControlContract)) {
    it(
      name,
      async () => {
        const worker = await Worker.create({ connection: env.nativeConnection, taskQueue: 'contract', workflowsPath: path.join(process.cwd(), 'src', 'lib', 'contract-workflow.ts'), bundlerOptions });
        await worker.runUntil(check(runs, 'owner/repo#1'));
      },
      120_000,
    );
  }
});
