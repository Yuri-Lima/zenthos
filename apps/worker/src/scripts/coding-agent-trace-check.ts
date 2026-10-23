/**
 * Proves the coding agent's trace end to end (ADR 015): `pnpm nx run @zenthos/worker:coding-agent-trace-check`.
 * Runs Claude Code on a tiny task in a scratch git repository (one new file, no shell commands allowed), traced into
 * the LangFuse the worker is configured for, then reads the run back through the cost check and prints the verdict
 * for the coding agent with the session link. Costs a few cents on the organisation credential (ADR 018).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LangfuseTraceUsage, startLangfuseTracing } from '@zenthos/adapter-langfuse';
import { compareWithTraces, repoProfile } from '@zenthos/domain';
import { codingAgent, loadWorkerConfig } from '../composition.js';

const config = loadWorkerConfig();
if (!config.LANGFUSE_PUBLIC_KEY || !config.LANGFUSE_SECRET_KEY) throw new Error('set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY: the check reads the run back from LangFuse');
const langfuse = { baseUrl: config.LANGFUSE_BASE_URL, publicKey: config.LANGFUSE_PUBLIC_KEY, secretKey: config.LANGFUSE_SECRET_KEY };
const projectId = process.env['LANGFUSE_PROJECT_ID'] ?? 'zenthos-dev';

const repo = mkdtempSync(path.join(tmpdir(), 'zenthos-trace-check-'));
const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=zenthos', '-c', 'user.email=zenthos@pipeline.invalid', ...args], { cwd: repo });
writeFileSync(path.join(repo, 'README.md'), '# scratch\n');
git('init', '-q');
git('add', '.');
git('commit', '-qm', 'init');

const ticketKey = `zenthos/trace-check#${Date.now() % 100_000}`;
const trace = startLangfuseTracing(langfuse);
try {
  const agent = await codingAgent({ ...config, CODING_AGENT: 'claude-code' }, { maxTurns: 6 });
  const implementation = await agent.implement({
    workspace: { id: 'trace-check', path: repo, repo: 'zenthos/trace-check', baseBranch: 'main', branch: 'zenthos/trace-check' },
    spec: { ticketKey, problem: 'The repository has no greeting file', inScope: ['Add hello.txt'], outOfScope: [], acceptanceCriteria: [{ id: 'AC-1', statement: 'hello.txt exists and contains the line: hi', testHint: 'read the file' }], touchedAreas: ['hello.txt'], risks: [] },
    profile: repoProfile({ repo: 'zenthos/trace-check', cloneUrl: repo, baseBranch: 'main', allowedCommands: [], gateCommands: [] }),
  });
  console.log(JSON.stringify({ ticketKey, estimatedCostUsd: implementation.estimatedCostUsd, tokens: implementation.tokens }));
  await trace.shutdown();
  const reader = new LangfuseTraceUsage({ ...langfuse, projectId });
  let traced = await reader.usageForRun(ticketKey);
  // LangFuse ingests asynchronously; Claude Code flushes its spans when it exits.
  for (let i = 0; i < 20 && !traced.coding_agent?.totalTokens; i++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    traced = await reader.usageForRun(ticketKey);
  }
  const verdict = compareWithTraces({ coding_agent: { estimatedCostUsd: implementation.estimatedCostUsd, tokens: implementation.tokens } }, traced).find((c) => c.agent === 'coding_agent');
  console.log(JSON.stringify(verdict));
  console.log(reader.sessionUrl(ticketKey));
  if (verdict?.verdict !== 'match') process.exitCode = 1;
} finally {
  rmSync(repo, { recursive: true, force: true });
}
