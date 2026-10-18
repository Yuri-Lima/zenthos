import { existsSync } from 'node:fs';
import { OctokitGitHubApps } from '@zenthos/adapter-github/live';
import { InMemoryGitHubApps, InMemoryProviderConnections, InMemoryRepoProfiles, InMemoryRunControl, InMemoryRuns, InMemorySessions } from '@zenthos/adapter-in-memory';
import { migrate, PostgresProviderConnections, PostgresRepoProfiles, PostgresRuns, PostgresSessions, SecretBox } from '@zenthos/adapter-postgres';
import { TemporalRunControl } from '@zenthos/adapter-temporal';
import type { GitHubAppsPort, ProviderConnectionsPort, RepoProfilesPort, RunControlPort, RunsPort, SessionsPort } from '@zenthos/ports';
import pg from 'pg';
import { loadConfig, type ApiConfig } from './config.js';

import type { ApiPorts } from './ports.js';

export function loadApiConfig(): ApiConfig {
  if (existsSync('.env')) process.loadEnvFile('.env');
  return loadConfig(process.env);
}

/** The composition root: adapters are chosen here, from the config, and nowhere else. */
export async function composePorts(config: ApiConfig): Promise<ApiPorts> {
  const closers: (() => Promise<void>)[] = [];
  let connections: ProviderConnectionsPort = new InMemoryProviderConnections();
  let profiles: RepoProfilesPort = new InMemoryRepoProfiles();
  let runStore: RunsPort = new InMemoryRuns();
  let sessions: SessionsPort = new InMemorySessions();
  if (config.DATABASE_URL && config.ZENTHOS_SECRETS_KEY) {
    const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
    await migrate(pool);
    connections = new PostgresProviderConnections(pool, new SecretBox(config.ZENTHOS_SECRETS_KEY));
    profiles = new PostgresRepoProfiles(pool);
    runStore = new PostgresRuns(pool);
    sessions = new PostgresSessions(pool);
    closers.push(() => pool.end());
  }
  let runs: RunControlPort = new InMemoryRunControl();
  if (config.RUN_CONTROL === 'temporal') {
    const temporal = await TemporalRunControl.connect({ address: config.TEMPORAL_ADDRESS, namespace: config.TEMPORAL_NAMESPACE, taskQueue: config.TEMPORAL_TASK_QUEUE });
    runs = temporal;
    closers.push(() => temporal.close());
  }
  const githubApps: GitHubAppsPort = config.GITHUB_APPS === 'octokit' ? new OctokitGitHubApps() : new InMemoryGitHubApps();
  return { connections, profiles, runs, runStore, githubApps, sessions, close: async () => void (await Promise.all(closers.map((close) => close()))) };
}
