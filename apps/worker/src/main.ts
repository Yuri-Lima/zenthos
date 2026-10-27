import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NativeConnection, Worker } from '@temporalio/worker';
import { createActivities } from './activities.js';
import { bundlerOptions } from '@zenthos/adapter-temporal';
import { githubCredentials } from './config.js';
import { agentResolver, github, issueTracker, loadWorkerConfig, sandbox, scm, stores, tracing } from './composition.js';

async function main() {
  const config = loadWorkerConfig();
  const trace = tracing(config);
  const repoContext = config.REPO_CONTEXT_FILE ? await readFile(config.REPO_CONTEXT_FILE, 'utf8') : '';

  const { profiles, connections, runs, modelKeys } = await stores(config);
  const clients = github(config, { profiles, connections });
  console.log(
    `zenthos worker: issueTracker=${config.ISSUE_TRACKER} specWriter=${config.SPEC_WRITER} sandbox=${config.SANDBOX} codingAgent=${config.CODING_AGENT} scm=${config.SCM} reviewer=${config.REVIEWER} stores=${config.DATABASE_URL ? 'postgres' : 'memory'} githubFallback=${githubCredentials(config)?.type ?? 'none'} taskQueue=${config.TEMPORAL_TASK_QUEUE}`,
  );
  const connection = await NativeConnection.connect({ address: config.TEMPORAL_ADDRESS });
  const worker = await Worker.create({
    connection,
    namespace: config.TEMPORAL_NAMESPACE,
    taskQueue: config.TEMPORAL_TASK_QUEUE,
    workflowsPath: fileURLToPath(new URL('./workflows.ts', import.meta.url)),
    activities: createActivities({
      issueTracker: issueTracker(config, clients),
      sandbox: await sandbox(config, profiles, clients),
      scm: scm(config, clients),
      agentsFor: agentResolver(config, trace, modelKeys),
      repoContext,
      profiles,
      runs,
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
