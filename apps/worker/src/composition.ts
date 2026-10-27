import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ClaudeCodeAgent } from '@zenthos/adapter-claude-code';
import { GitSandbox } from '@zenthos/adapter-git-sandbox';
import { GitHubIssueTracker, GitHubScm, parseRepo, ResolvingGitHubClients, type GitHubClients } from '@zenthos/adapter-github';
import { createGitHubClients } from '@zenthos/adapter-github/live';
import { InMemoryCodingAgent, InMemoryIssueTracker, InMemoryModelKeys, InMemoryProviderConnections, InMemoryRepoProfiles, InMemoryReviewer, InMemoryRuns, InMemoryScm, InMemorySpecWriter, LocalSandbox } from '@zenthos/adapter-in-memory';
import { migrate, PostgresModelKeys, PostgresProviderConnections, PostgresRepoProfiles, PostgresRuns, SecretBox } from '@zenthos/adapter-postgres';
import { credentialsForRepo } from '@zenthos/application';
import { DomainError, traceSessionId, type TracePurpose } from '@zenthos/domain';
import pg from 'pg';
import { LangfuseAgentTracing, noTracing, startLangfuseTracing } from '@zenthos/adapter-langfuse';
import { costEstimator, createAnthropicReviewerModels, createAnthropicSpecModel, LangGraphReviewer, LangGraphSpecWriter, REVIEWER_VERSION, SPEC_WRITER_VERSION, verifyAnthropicAccess } from '@zenthos/agents';
import type { CodingAgentPort, IssueTrackerPort, ModelKeysPort, ProviderConnectionsPort, RepoProfilesPort, ReviewerPort, RunsPort, SandboxPort, ScmPort, SpecWriterPort } from '@zenthos/ports';
import type { Agents } from './activities.js';
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

/** `close` ends the Postgres pool; one-off scripts call it so the process does not wait on idle connections. */
export type Stores = { profiles: RepoProfilesPort; connections: ProviderConnectionsPort; runs: RunsPort; modelKeys: ModelKeysPort; close(): Promise<void> };

/** Profiles, connections and model keys come from Postgres when the API manages them, otherwise from the code list for dry runs. */
export async function stores(config: WorkerConfig): Promise<Stores> {
  if (!config.DATABASE_URL) return { profiles: new InMemoryRepoProfiles(REPO_PROFILES), connections: new InMemoryProviderConnections(), runs: new InMemoryRuns(), modelKeys: new InMemoryModelKeys(), close: async () => undefined };
  if (!config.ZENTHOS_SECRETS_KEY) throw new Error('ZENTHOS_SECRETS_KEY is required with DATABASE_URL (openssl rand -hex 32)');
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  await migrate(pool);
  const box = new SecretBox(config.ZENTHOS_SECRETS_KEY);
  return { profiles: new PostgresRepoProfiles(pool), connections: new PostgresProviderConnections(pool, box), runs: new PostgresRuns(pool), modelKeys: new PostgresModelKeys(pool, box), close: () => pool.end() };
}

/**
 * GitHub, with credentials decided per repository: the connection the profile names, else what the
 * environment provides (ADR 006). Undefined only when neither can ever apply.
 */
export function github(config: WorkerConfig, { profiles, connections }: Pick<Stores, 'profiles' | 'connections'>): GitHubClients | undefined {
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

/**
 * `purpose` names the trace session (ADR 015): the workflow traces as `run`, evals and manual commands beside it.
 * `apiKey` is the workspace's own (ADR 019); without one the Anthropic SDK resolves the deployment's credentials.
 */
export type AgentOptions = { purpose?: TracePurpose; apiKey?: string };

export async function specWriter(config: WorkerConfig, trace: ReturnType<typeof tracing>, { purpose = 'run', apiKey }: AgentOptions = {}): Promise<SpecWriterPort> {
  if (config.SPEC_WRITER === 'memory') return new InMemorySpecWriter();
  const modelConfig = { model: config.ZENTHOS_SPEC_MODEL, apiKey };
  await verifyAnthropicAccess(modelConfig);
  return new LangGraphSpecWriter({
    model: createAnthropicSpecModel(modelConfig),
    callbacks: ({ ticket }) => trace.callbacks({ sessionId: traceSessionId(ticket.key, purpose), version: SPEC_WRITER_VERSION }),
    estimateCost: costEstimator(modelConfig.model),
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

/**
 * With LangFuse keys, each implementation runs inside a span in the ticket's trace and Claude Code exports its own
 * spans there (ADR 015); `tracing(config)` must have registered the OpenTelemetry provider first, as the worker does.
 * Claude Code's credential is checked here, as the agent is built: the workspace's key or an organisation credential,
 * never a subscription (ADR 018).
 */
export async function codingAgent(config: WorkerConfig, overrides: { maxTurns?: number; apiKey?: string } = {}): Promise<CodingAgentPort> {
  if (config.CODING_AGENT !== 'claude-code') return new InMemoryCodingAgent();
  const traced = config.LANGFUSE_PUBLIC_KEY && config.LANGFUSE_SECRET_KEY;
  const agent = new ClaudeCodeAgent({
    configDir: config.CODING_AGENT_CONFIG_DIR,
    model: config.ZENTHOS_CODING_MODEL,
    ...overrides,
    ...(traced ? { tracing: new LangfuseAgentTracing({ baseUrl: config.LANGFUSE_BASE_URL, publicKey: config.LANGFUSE_PUBLIC_KEY ?? '', secretKey: config.LANGFUSE_SECRET_KEY ?? '' }) } : {}),
  });
  await agent.verifyAccess();
  return agent;
}

export async function reviewer(config: WorkerConfig, trace: ReturnType<typeof tracing>, { purpose = 'run', apiKey }: AgentOptions = {}): Promise<ReviewerPort> {
  if (config.REVIEWER === 'memory') return new InMemoryReviewer();
  const modelConfig = { model: config.ZENTHOS_REVIEW_MODEL, apiKey };
  await verifyAnthropicAccess(modelConfig);
  return new LangGraphReviewer({
    models: createAnthropicReviewerModels(modelConfig),
    callbacks: ({ spec }) => trace.callbacks({ sessionId: traceSessionId(spec.ticketKey, purpose), version: REVIEWER_VERSION }),
    estimateCost: costEstimator(modelConfig.model),
  });
}

export function scm(config: WorkerConfig, clients?: GitHubClients): ScmPort {
  return config.SCM === 'github' && clients ? new GitHubScm(clients) : new InMemoryScm();
}

/**
 * The agents per workspace (ADR 019): built on the workspace's own key the first time one of its runs needs them,
 * kept until the key is replaced or removed, and built again then. A run without a workspace, or a workspace
 * without a key, gets agents on the deployment's credentials, which is what dry runs and CI evals use. A key the
 * provider refuses, or no credential at all, fails the activity with a domain error naming the cause.
 */
export function agentResolver(config: WorkerConfig, trace: ReturnType<typeof tracing>, modelKeys: ModelKeysPort): (workspaceId?: string) => Promise<Agents> {
  const built = new Map<string, { stamp: string; agents: Promise<Agents> }>();
  const build = async (apiKey?: string): Promise<Agents> => ({
    specWriter: await specWriter(config, trace, { apiKey }),
    codingAgent: await codingAgent(config, { apiKey }),
    reviewer: await reviewer(config, trace, { apiKey }),
  });
  return async (workspaceId = '') => {
    const key = workspaceId ? await modelKeys.get(workspaceId) : undefined;
    const stamp = key?.createdAt ?? 'deployment';
    const cached = built.get(workspaceId);
    if (cached?.stamp === stamp) return cached.agents;
    const agents = build(key?.apiKey).catch((error: unknown) => {
      built.delete(workspaceId);
      throw new DomainError(key ? 'model_key_invalid' : 'model_key_missing', { workspaceId, reason: error instanceof Error ? error.message : String(error) });
    });
    built.set(workspaceId, { stamp, agents });
    return agents;
  };
}
