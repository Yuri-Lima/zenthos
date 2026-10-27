import type { AccountInfo } from '@anthropic-ai/claude-agent-sdk';

/**
 * Claude Code runs on organisation credentials only (ADR 018), on a laptop as much as on a server: a Claude Console
 * sign-in kept in ZenthOs's own Claude Code config directory, Workload Identity Federation, a cloud provider, or an
 * API key. Never a claude.ai login: Anthropic does not allow a product built on the Agent SDK to run on one.
 */

/** Environment that gives Claude Code a credential without a stored sign-in, from its authentication order. */
const ENVIRONMENT_CREDENTIALS = [
  ['CLAUDE_CODE_USE_BEDROCK'],
  ['CLAUDE_CODE_USE_VERTEX'],
  ['CLAUDE_CODE_USE_FOUNDRY'],
  ['ANTHROPIC_AUTH_TOKEN'],
  ['ANTHROPIC_API_KEY'],
  ['ANTHROPIC_FEDERATION_RULE_ID', 'ANTHROPIC_ORGANIZATION_ID'],
];

type Env = Record<string, string | undefined>;

/**
 * Claude Code's environment: ZenthOs's own config directory, so a developer's personal claude.ai login is never in
 * reach, without the one variable that carries a subscription token (`claude setup-token`), and with the
 * workspace's own API key when it has one (ADR 019), which outranks every stored sign-in in Claude Code's order.
 */
export function claudeCodeEnv(configDir: string, extra: Record<string, string> = {}, env: Env = process.env, apiKey?: string): Env {
  const claudeCode: Env = { ...env, ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}), ...extra, CLAUDE_CONFIG_DIR: configDir };
  delete claudeCode['CLAUDE_CODE_OAUTH_TOKEN'];
  return claudeCode;
}

/** Why Claude Code must not run on the account it reports, or undefined when it may. `env` is the one Claude Code gets. */
export function credentialRefusal(account: AccountInfo, env: Env): string | undefined {
  if (account.subscriptionType) return `it is signed in to a claude.ai subscription (${account.subscriptionType}); the coding agent runs on the workspace's API key or the deployment's organisation credentials only (ADR 018)`;
  const signedIn = Boolean(account.email || account.organization);
  const fromEnvironment = ENVIRONMENT_CREDENTIALS.some((names) => names.every((name) => env[name]));
  if (!signedIn && !fromEnvironment) return `it has no organisation credential; an owner or admin enters the workspace's model API key in Settings (ADR 019), or the deployment sets up Workload Identity Federation (docs/authentication.md)`;
  return undefined;
}
