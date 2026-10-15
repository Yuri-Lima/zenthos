import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NativeConnection, Worker } from '@temporalio/worker';
import { createActivities } from './activities.js';
import { bundlerOptions } from './bundler.js';
import { githubCredentials } from './config.js';
import { codingAgent, github, issueTracker, loadWorkerConfig, reviewer, sandbox, scm, specWriter, tracing } from './composition.js';
import { REPO_PROFILES } from './repos.js';

async function main() {
  const config = loadWorkerConfig();
  const trace = tracing(config);
  const repoContext = config.REPO_CONTEXT_FILE ? await readFile(config.REPO_CONTEXT_FILE, 'utf8') : '';

  const clients = github(config);
  console.log(
    `zenthos worker: issueTracker=${config.ISSUE_TRACKER} specWriter=${config.SPEC_WRITER} sandbox=${config.SANDBOX} codingAgent=${config.CODING_AGENT} scm=${config.SCM} reviewer=${config.REVIEWER} github=${githubCredentials(config)?.type ?? 'none'} taskQueue=${config.TEMPORAL_TASK_QUEUE}`,
  );
  const connection = await NativeConnection.connect({ address: config.TEMPORAL_ADDRESS });
  const worker = await Worker.create({
    connection,
    namespace: config.TEMPORAL_NAMESPACE,
    taskQueue: config.TEMPORAL_TASK_QUEUE,
    workflowsPath: fileURLToPath(new URL('./workflows.ts', import.meta.url)),
    activities: createActivities({
      issueTracker: issueTracker(config, clients),
      specWriter: await specWriter(config, trace),
      sandbox: await sandbox(config, clients),
      codingAgent: codingAgent(config),
      scm: scm(config, clients),
      reviewer: await reviewer(config, trace),
      repoContext,
      profiles: REPO_PROFILES,
    }),
    bundlerOptions,
  });

  const stop = () => worker.shutdown();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await worker.run();
  } finally {
    await trace.shutdown();
    await connection.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
