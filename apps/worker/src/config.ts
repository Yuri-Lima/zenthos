import { readFileSync } from 'node:fs';
import type { GitHubCredentials } from '@zenthos/domain';
import { z } from 'zod';

/** Every setting the worker reads, validated once at boot. Missing config fails here, never mid-run. */
export const WorkerConfigSchema = z.object({
  TEMPORAL_ADDRESS: z.string().default('localhost:7233'),
  TEMPORAL_NAMESPACE: z.string().default('default'),
  TEMPORAL_TASK_QUEUE: z.string().default('zenthos'),
  /** `github` needs a GitHub App (default) or a token. `memory` is a dry run that never leaves the process. */
  ISSUE_TRACKER: z.enum(['github', 'memory']).default('memory'),
  /** GitHub App: ZenthOs acts as the app's bot in every repository the app is installed on. */
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY_FILE: z.string().optional(),
  /** Personal token: the interim for a single account. Ignored when the app is configured. */
  GITHUB_TOKEN: z.string().optional(),
  /** `memory` writes a canned spec. `anthropic` calls Claude; credentials come from an API key, an
   * `ant auth login` profile or Workload Identity Federation (docs/authentication.md). Access is
   * verified at boot. */
  SPEC_WRITER: z.enum(['anthropic', 'memory']).default('memory'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ZENTHOS_SPEC_MODEL: z.string().default('claude-opus-5-5'),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().default('http://localhost:3100'),
  /** A markdown file describing the target repo (its AGENTS.md or CLAUDE.md). */
  REPO_CONTEXT_FILE: z.string().optional(),
  /** `git` clones the repo per run; `memory` is a temp directory with no git and no processes. */
  SANDBOX: z.enum(['git', 'memory']).default('memory'),
  /** Where git sandboxes live; one subdirectory per run, removed on cleanup. */
  SANDBOX_ROOT: z.string().optional(),
  /** `claude-code` runs Claude Code headless in the sandbox; `memory` writes a markdown note. */
  CODING_AGENT: z.enum(['claude-code', 'memory']).default('memory'),
  ZENTHOS_CODING_MODEL: z.string().optional(),
  /** `github` opens pull requests with GITHUB_TOKEN; `memory` records them. */
  SCM: z.enum(['github', 'memory']).default('memory'),
});

export type WorkerConfig = z.infer<typeof WorkerConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const config = WorkerConfigSchema.parse(env);
  if ((config.ISSUE_TRACKER === 'github' || config.SCM === 'github') && !githubCredentials(config)) {
    throw new Error('ISSUE_TRACKER=github and SCM=github need GITHUB_APP_ID with GITHUB_APP_PRIVATE_KEY or _FILE, or GITHUB_TOKEN');
  }
  return config;
}

/** The app wins over a token when both are set. Undefined when neither is. */
export function githubCredentials(config: WorkerConfig): GitHubCredentials | undefined {
  const privateKey = config.GITHUB_APP_PRIVATE_KEY ?? (config.GITHUB_APP_PRIVATE_KEY_FILE ? readFileSync(config.GITHUB_APP_PRIVATE_KEY_FILE, 'utf8') : undefined);
  if (config.GITHUB_APP_ID && privateKey) return { type: 'github-app', appId: config.GITHUB_APP_ID, privateKey };
  if (config.GITHUB_TOKEN) return { type: 'github-token', token: config.GITHUB_TOKEN };
  return undefined;
}
