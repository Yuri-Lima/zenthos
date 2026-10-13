import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NativeConnection, Worker } from '@temporalio/worker';
import { createGitHubIssueTracker } from '@zenthos/adapter-github';
import { InMemoryIssueTracker, InMemorySpecWriter } from '@zenthos/adapter-in-memory';
import { noTracing, startLangfuseTracing } from '@zenthos/adapter-langfuse';
import { createAnthropicSpecModel, LangGraphSpecWriter, SPEC_WRITER_VERSION, verifyAnthropicAccess } from '@zenthos/agents';
import type { IssueTrackerPort, SpecWriterPort } from '@zenthos/ports';
import { createActivities } from './activities.js';
import { bundlerOptions } from './bundler.js';
import { loadConfig, type WorkerConfig } from './config.js';

/** Dry runs have one ticket, `memory#1`; approve it with `pnpm cli approve memory#1`. */
const DRY_RUN_TICKET = {
  key: 'memory#1',
  title: 'Export the client list as CSV',
  body: 'Partners want to download the list they see on screen as a CSV file.',
  url: 'https://example.test/memory/1',
  labels: [],
};

function issueTracker(config: WorkerConfig): IssueTrackerPort {
  return config.ISSUE_TRACKER === 'github'
    ? createGitHubIssueTracker(config.GITHUB_TOKEN as string)
    : new InMemoryIssueTracker().seed(DRY_RUN_TICKET);
}

function tracing(config: WorkerConfig) {
  return config.LANGFUSE_PUBLIC_KEY && config.LANGFUSE_SECRET_KEY
    ? startLangfuseTracing({ publicKey: config.LANGFUSE_PUBLIC_KEY, secretKey: config.LANGFUSE_SECRET_KEY, baseUrl: config.LANGFUSE_BASE_URL })
    : noTracing;
}

async function specWriter(config: WorkerConfig, trace: ReturnType<typeof tracing>): Promise<SpecWriterPort> {
  if (config.SPEC_WRITER === 'memory') return new InMemorySpecWriter();
  const modelConfig = { model: config.ZENTHOS_SPEC_MODEL, apiKey: config.ANTHROPIC_API_KEY };
  await verifyAnthropicAccess(modelConfig);
  return new LangGraphSpecWriter({
    model: createAnthropicSpecModel(modelConfig),
    callbacks: ({ ticket }) => trace.callbacks({ sessionId: ticket.key, version: SPEC_WRITER_VERSION }),
  });
}

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const config = loadConfig(process.env);
  const trace = tracing(config);
  const repoContext = config.REPO_CONTEXT_FILE ? await readFile(config.REPO_CONTEXT_FILE, 'utf8') : '';

  const connection = await NativeConnection.connect({ address: config.TEMPORAL_ADDRESS });
  const worker = await Worker.create({
    connection,
    namespace: config.TEMPORAL_NAMESPACE,
    taskQueue: config.TEMPORAL_TASK_QUEUE,
    workflowsPath: fileURLToPath(new URL('./workflows.ts', import.meta.url)),
    activities: createActivities({ issueTracker: issueTracker(config), specWriter: await specWriter(config, trace), repoContext }),
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
