import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ClaudeCodeAgent } from '@zenthos/adapter-claude-code';
import { GitSandbox } from '@zenthos/adapter-git-sandbox';
import { GitHubIssueTracker, GitHubScm, parseRepo, ResolvingGitHubClients, type GitHubClients } from '@zenthos/adapter-github';
import { createGitHubClients } from '@zenthos/adapter-github/live';
import { InMemoryCodingAgent, InMemoryIssueTracker, InMemoryProviderConnections, InMemoryRepoProfiles, InMemoryReviewer, InMemoryRuns, InMemoryScm, InMemorySpecWriter, LocalSandbox } from '@zenthos/adapter-in-memory';
import { migrate, PostgresProviderConnections, PostgresRepoProfiles, PostgresRuns, SecretBox } from '@zenthos/adapter-postgres';
import { credentialsForRepo } from '@zenthos/application';
import pg from 'pg';
import { noTracing, startLangfuseTracing } from '@zenthos/adapter-langfuse';
import { createAnthropicReviewerModels, createAnthropicSpecModel, LangGraphReviewer, LangGraphSpecWriter, REVIEWER_VERSION, SPEC_WRITER_VERSION, verifyAnthropicAccess } from '@zenthos/agents';
import type { CodingAgentPort, IssueTrackerPort, ProviderConnectionsPort, RepoProfilesPort, ReviewerPort, RunsPort, SandboxPort, ScmPort, SpecWriterPort } from '@zenthos/ports';
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

export type Stores = { profiles: RepoProfilesPort; connections: ProviderConnectionsPort; runs: RunsPort };

/** Profiles and connections come from Postgres when the API manages them, otherwise from the code list for dry runs. */
export async function stores(config: WorkerConfig): Promise<Stores> {
  if (!config.DATABASE_URL) return { profiles: new InMemoryRepoProfiles(REPO_PROFILES), connections: new InMemoryProviderConnections(), runs: new InMemoryRuns() };
  if (!config.ZENTHOS_SECRETS_KEY) throw new Error('ZENTHOS_SECRETS_KEY is required with DATABASE_URL (openssl rand -hex 32)');
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  await migrate(pool);
  return { profiles: new PostgresRepoProfiles(pool), connections: new PostgresProviderConnections(pool, new SecretBox(config.ZENTHOS_SECRETS_KEY)), runs: new PostgresRuns(pool) };
}

/**
 * GitHub, with credentials decided per repository: the connection the profile names, else what the
 * environment provides (ADR 006). Undefined only when neither can ever apply.
 */
export function github(config: WorkerConfig, { profiles, connections }: Stores): GitHubClients | undefined {
  const fallback = githubCredentials(config);
  if (!fallback && !config.DATABASE_URL) return undefined;
  return new ResolvingGitHubClients((ref) => credentialsForRepo({ profiles, connections }, `${ref.owner}/${ref.repo}`, fallback), createGitHubClients);
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
