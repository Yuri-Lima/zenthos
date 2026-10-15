import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeConnection, Worker } from '@temporalio/worker';
import { ClaudeCodeAgent } from '@zenthos/adapter-claude-code';
import { GitSandbox } from '@zenthos/adapter-git-sandbox';
import { createGitHubClients, GitHubIssueTracker, GitHubScm, parseRepo, type GitHubClients } from '@zenthos/adapter-github';
import { InMemoryCodingAgent, InMemoryIssueTracker, InMemorySandbox, InMemoryScm, InMemorySpecWriter } from '@zenthos/adapter-in-memory';
import { noTracing, startLangfuseTracing } from '@zenthos/adapter-langfuse';
import { createAnthropicSpecModel, LangGraphSpecWriter, SPEC_WRITER_VERSION, verifyAnthropicAccess } from '@zenthos/agents';
import type { CodingAgentPort, IssueTrackerPort, SandboxPort, ScmPort, SpecWriterPort } from '@zenthos/ports';
import { createActivities } from './activities.js';
import { bundlerOptions } from './bundler.js';
import { githubCredentials, loadConfig, type WorkerConfig } from './config.js';
import { REPO_PROFILES } from './repos.js';

/** Dry runs have one ticket, `memory#1`; approve it with `pnpm cli approve memory#1`. */
const DRY_RUN_TICKET = {
  key: 'memory#1',
  title: 'Export the client list as CSV',
  body: 'Partners want to download the list they see on screen as a CSV file.',
  url: 'https://example.test/memory/1',
  labels: [],
};

/** One GitHub connection for the worker; with an app it covers every repository the app is installed on. */
function github(config: WorkerConfig): GitHubClients | undefined {
  const credentials = githubCredentials(config);
  return credentials && createGitHubClients(credentials);
}

function issueTracker(config: WorkerConfig, clients?: GitHubClients): IssueTrackerPort {
  return config.ISSUE_TRACKER === 'github' && clients ? new GitHubIssueTracker(clients) : new InMemoryIssueTracker().seed(DRY_RUN_TICKET);
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

async function sandbox(config: WorkerConfig, clients?: GitHubClients): Promise<SandboxPort> {
  if (config.SANDBOX === 'memory') return new InMemorySandbox(REPO_PROFILES);
  const root = config.SANDBOX_ROOT ?? path.join(tmpdir(), 'zenthos-sandboxes');
  await mkdir(root, { recursive: true });
  return new GitSandbox({
    root,
    profiles: REPO_PROFILES,
    credential: async (profile) => (clients && profile.cloneUrl.startsWith('https://github.com/') ? (await clients.for(parseRepo(profile.repo))).gitToken() : undefined),
  });
}

function codingAgent(config: WorkerConfig): CodingAgentPort {
  return config.CODING_AGENT === 'claude-code' ? new ClaudeCodeAgent({ model: config.ZENTHOS_CODING_MODEL }) : new InMemoryCodingAgent();
}

function scm(config: WorkerConfig, clients?: GitHubClients): ScmPort {
  return config.SCM === 'github' && clients ? new GitHubScm(clients) : new InMemoryScm();
}

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const config = loadConfig(process.env);
  const trace = tracing(config);
  const repoContext = config.REPO_CONTEXT_FILE ? await readFile(config.REPO_CONTEXT_FILE, 'utf8') : '';

  const clients = github(config);
  console.log(
    `zenthos worker: issueTracker=${config.ISSUE_TRACKER} specWriter=${config.SPEC_WRITER} sandbox=${config.SANDBOX} codingAgent=${config.CODING_AGENT} scm=${config.SCM} github=${githubCredentials(config)?.type ?? 'none'} taskQueue=${config.TEMPORAL_TASK_QUEUE}`,
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
