import { repoProfile, type Spec, type Checkout } from '@zenthos/domain';
import { decideToolUse } from './permissions.js';
import { implementationPrompt } from './prompt.js';

const profile = repoProfile({
  repo: 'owner/repo',
  cloneUrl: 'https://github.com/owner/repo.git',
  baseBranch: 'staging',
  allowedCommands: ['bun run lint', 'bun run format:check'],
  gateCommands: ['bun run lint'],
});
const spec: Spec = {
  ticketKey: 'owner/repo#4',
  problem: 'Partners cannot export the list',
  inScope: ['CSV export button'],
  outOfScope: ['PDF export'],
  acceptanceCriteria: [{ id: 'AC-1', statement: 'Export downloads a CSV with every visible row', testHint: 'Playwright: click export, read the download' }],
  touchedAreas: ['src/routes/clients'],
  risks: [],
};
const checkout: Checkout = { id: 'w', path: '/tmp/w', repo: profile.repo, baseBranch: 'staging', branch: 'zenthos/owner-repo-4' };

describe('implementationPrompt', () => {
  it('carries the criteria, the allowlist, the forbidden paths and the feedback', () => {
    const prompt = implementationPrompt({ checkout, spec, profile, feedback: 'ci: bun run lint exited 1' });
    expect(prompt).toContain('AC-1: Export downloads a CSV');
    expect(prompt).toContain('`bun run lint`, `bun run format:check`');
    expect(prompt).toContain('eslint.config');
    expect(prompt).toContain('migrations/');
    expect(prompt).toContain('Do not run git');
    expect(prompt).toContain('bun run lint exited 1');
  });
});

describe('decideToolUse', () => {
  it('allows an allowlisted shell command and denies everything else', () => {
    expect(decideToolUse(profile, 'Bash', { command: 'bun run lint' })).toEqual({ behavior: 'allow' });
    expect(decideToolUse(profile, 'Bash', { command: 'git push --force' }).behavior).toBe('deny');
    expect(decideToolUse(profile, 'Bash', { command: 'bun run lint && rm -rf .' }).behavior).toBe('deny');
    expect(decideToolUse(profile, 'WebFetch', { url: 'https://x' }).behavior).toBe('deny');
  });
});
