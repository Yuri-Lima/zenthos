import { z } from 'zod';

/** Every setting the worker reads, validated once at boot. Missing config fails here, never mid-run. */
export const WorkerConfigSchema = z.object({
  TEMPORAL_ADDRESS: z.string().default('localhost:7233'),
  TEMPORAL_NAMESPACE: z.string().default('default'),
  TEMPORAL_TASK_QUEUE: z.string().default('zenthos'),
  /** `github` needs GITHUB_TOKEN. `memory` is a dry run that never leaves the process. */
  ISSUE_TRACKER: z.enum(['github', 'memory']).default('memory'),
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
});

export type WorkerConfig = z.infer<typeof WorkerConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const config = WorkerConfigSchema.parse(env);
  if (config.ISSUE_TRACKER === 'github' && !config.GITHUB_TOKEN) {
    throw new Error('ISSUE_TRACKER=github needs GITHUB_TOKEN');
  }
  return config;
}
