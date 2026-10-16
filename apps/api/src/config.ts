import { z } from 'zod';

/** Everything the API reads from the environment. Defaults are a dry run: in-memory stores, no Temporal. */
const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3200),
  /** Public URL GitHub can reach: the webhook and the manifest callbacks hang off it. */
  ZENTHOS_API_BASE_URL: z.string().url().default('http://localhost:3200'),
  /** Set to use Postgres for connections and profiles; unset keeps them in memory for the process. */
  DATABASE_URL: z.string().url().optional(),
  /** 32 bytes as hex (openssl rand -hex 32); required with DATABASE_URL, it seals credentials at rest. */
  ZENTHOS_SECRETS_KEY: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  RUN_CONTROL: z.enum(['temporal', 'memory']).default('memory'),
  TEMPORAL_ADDRESS: z.string().default('localhost:7233'),
  TEMPORAL_NAMESPACE: z.string().default('default'),
  TEMPORAL_TASK_QUEUE: z.string().default('zenthos'),
  GITHUB_APPS: z.enum(['octokit', 'memory']).default('memory'),
});

export type ApiConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv): ApiConfig {
  const config = ConfigSchema.parse(env);
  if (config.DATABASE_URL && !config.ZENTHOS_SECRETS_KEY) throw new Error('ZENTHOS_SECRETS_KEY is required with DATABASE_URL (openssl rand -hex 32)');
  return config;
}
