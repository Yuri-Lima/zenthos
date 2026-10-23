/**
 * Signs ZenthOs's Claude Code in to a Claude Console account (ADR 018): `pnpm nx run @zenthos/worker:coding-agent-login`.
 * The sign-in lands in CODING_AGENT_CONFIG_DIR, apart from any personal Claude Code login on the machine, and its
 * usage is billed to the Console organisation. Then checks it the way the worker does at boot.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { ClaudeCodeAgent, claudeCodeEnv } from '@zenthos/adapter-claude-code';
import { loadWorkerConfig } from '../composition.js';

const configDir = loadWorkerConfig().CODING_AGENT_CONFIG_DIR;
mkdirSync(configDir, { recursive: true });
const login = spawnSync('claude', ['auth', 'login', '--console'], { stdio: 'inherit', env: claudeCodeEnv(configDir) });
if (login.error) throw new Error(`could not start the claude CLI (${login.error.message}); install Claude Code: https://code.claude.com/docs/en/setup`);
if (login.status !== 0) process.exit(login.status ?? 1);
await new ClaudeCodeAgent({ configDir }).verifyAccess();
console.log(`Claude Code is signed in for ZenthOs on a Console account (${configDir})`);
