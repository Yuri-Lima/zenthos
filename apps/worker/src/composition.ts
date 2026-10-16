import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ClaudeCodeAgent } from '@zenthos/adapter-claude-code';
import { GitSandbox } from '@zenthos/adapter-git-sandbox';
import { GitHubIssueTracker, GitHubScm, parseRepo, type GitHubClients } from '@zenthos/adapter-github';
import { createGitHubClients } from '@zenthos/adapter-github/live';
import { InMemoryCodingAgent, InMemoryIssueTracker, InMemoryRepoProfiles, InMemoryReviewer, InMemoryScm, InMemorySpecWriter, LocalSandbox } from '@zenthos/adapter-in-memory';
import { migrate, PostgresRepoProfiles } from '@zenthos/adapter-postgres';
import pg from 'pg';
import { noTracing, startLangfuseTracing } from '@zenthos/adapter-langfuse';
import { createAnthropicReviewerModels, createAnthropicSpecModel, LangGraphReviewer, LangGraphSpecWriter, REVIEWER_VERSION, SPEC_WRITER_VERSION, verifyAnthropicAccess } from '@zenthos/agents';
import type { CodingAgentPort, IssueTrackerPort, RepoProfilesPort, ReviewerPort, SandboxPort, ScmPort, SpecWriterPort } from '@zenthos/ports';
import { githubCredentials, loadConfig, type WorkerConfig } from './config.js';
import { REPO_PROFILES } from './repos.js';

/**
 * The composition root: every adapter is chosen here, from the config, and nowhere else. The worker
 * and the one-off scripts (contract check, manual review) share these so a change to how an adapter
 * is built happens once.
 */

/** Reads `.env` when present, then validates the environment. */
export function loadWorkerConfig(): WorkerConfig {
  if (existsSync('.env')) process.loadEnvFile('.env');
  return loadConfig(process.env);
}

/** Dry runs have one ticket, `memory#1`; approve it with `pnpm cli approve memory#1`. */
const DRY_RUN_TICKET = {
  key: 'memory#1',
  title: 'Export the client list as CSV',
  body: 'Partners want to download the list they see on screen as a CSV file.',
  url: 'https://example.test/memory/1',
  labels: [],
};

/** One GitHub connection for the worker; with an app it covers every repository the app is installed on. */
export function github(config: WorkerConfig): GitHubClients | undefined {
  const credentials = githubCredentials(config);
  return credentials && createGitHubClients(credentials);
}

export function issueTracker(config: WorkerConfig, clients?: GitHubClients): IssueTrackerPort {
  return config.ISSUE_TRACKER === 'github' && clients ? new GitHubIssueTracker(clients) : new InMemoryIssueTracker().seed(DRY_RUN_TICKET);
}

export function tracing(config: WorkerConfig) {
  return config.LANGFUSE_PUBLIC_KEY && config.LANGFUSE_SECRET_KEY
    ? startLangfuseTracing({ publicKey: config.LANGFUSE_PUBLIC_KEY, secretKey: config.LANGFUSE_SECRET_KEY, baseUrl: config.LANGFUSE_BASE_URL })
    : noTracing;
}

export async function specWriter(config: WorkerConfig, trace: ReturnType<typeof tracing>): Promise<SpecWriterPort> {
  if (config.SPEC_WRITER === 'memory') return new InMemorySpecWriter();
  const modelConfig = { model: config.ZENTHOS_SPEC_MODEL, apiKey: config.ANTHROPIC_API_KEY };
  await verifyAnthropicAccess(modelConfig);
  return new LangGraphSpecWriter({
    model: createAnthropicSpecModel(modelConfig),
    callbacks: ({ ticket }) => trace.callbacks({ sessionId: ticket.key, version: SPEC_WRITER_VERSION }),
  });
}

/** Profiles come from Postgres when the API manages them, otherwise from the code list for dry runs. */
export async function repoProfiles(config: WorkerConfig): Promise<RepoProfilesPort> {
  if (!config.DATABASE_URL) return new InMemoryRepoProfiles(REPO_PROFILES);
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  await migrate(pool);
  return new PostgresRepoProfiles(pool);
}

export async function sandbox(config: WorkerConfig, profiles: RepoProfilesPort, clients?: GitHubClients): Promise<SandboxPort> {
  if (config.SANDBOX === 'memory') return new LocalSandbox(profiles);
  const root = config.SANDBOX_ROOT ?? path.join(tmpdir(), 'zenthos-sandboxes');
  await mkdir(root, { recursive: true });
  return new GitSandbox({
    root,
    profiles,
    credential: async (profile) => (clients && profile.cloneUrl.startsWith('https://github.com/') ? (await clients.for(parseRepo(profile.repo))).gitToken() : undefined),
    author: async (profile) => (clients && profile.cloneUrl.startsWith('https://github.com/') ? (await clients.for(parseRepo(profile.repo))).gitIdentity() : { name: 'ZenthOs', email: 'zenthos@pipeline.invalid' }),
  });
}

export function codingAgent(config: WorkerConfig): CodingAgentPort {
  return config.CODING_AGENT === 'claude-code' ? new ClaudeCodeAgent({ model: config.ZENTHOS_CODING_MODEL }) : new InMemoryCodingAgent();
}

export async function reviewer(config: WorkerConfig, trace: ReturnType<typeof tracing>): Promise<ReviewerPort> {
  if (config.REVIEWER === 'memory') return new InMemoryReviewer();
  const modelConfig = { model: config.ZENTHOS_REVIEW_MODEL, apiKey: config.ANTHROPIC_API_KEY };
  await verifyAnthropicAccess(modelConfig);
  return new LangGraphReviewer({
    models: createAnthropicReviewerModels(modelConfig),
    callbacks: ({ spec }) => trace.callbacks({ sessionId: spec.ticketKey, version: REVIEWER_VERSION }),
  });
}

export function scm(config: WorkerConfig, clients?: GitHubClients): ScmPort {
  return config.SCM === 'github' && clients ? new GitHubScm(clients) : new InMemoryScm();
}
