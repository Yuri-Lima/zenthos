import { DomainError } from './errors.js';
import { branchNameFor, isCommandAllowed, isPipelineBranch, repoOfTicket, repoProfile } from './repo-profile.js';

const legal = repoProfile({
  repo: 'owner/legal',
  cloneUrl: 'https://github.com/owner/legal.git',
  baseBranch: 'staging',
  allowedCommands: ['bun install', 'bun run lint'],
  gateCommands: ['bun run lint'],
});

describe('repo profiles', () => {
  it('fills the default policy, always forbids tooling paths, and rejects a gate that is not allowed', () => {
    expect(legal.policy.maxImplementRounds).toBe(2);
    expect(legal.policy.forbiddenPathPrefixes).toContain('eslint.config');
    const custom = repoProfile({ ...legal, policy: { forbiddenPathPrefixes: ['supabase/'] } });
    expect(custom.policy.forbiddenPathPrefixes).toEqual(expect.arrayContaining(['eslint.config', 'supabase/']));
    expect(() =>
      repoProfile({ ...legal, gateCommands: ['bun run e2e'] }),
    ).toThrow(DomainError);
  });

  it('matches a ticket key to its profile and refuses unknown repos', () => {
    expect(repoOfTicket('owner/legal#12')).toBe('owner/legal');
    expect(() => repoOfTicket('no-hash')).toThrow(DomainError);
    expect(legal.repo).toBe('owner/legal');
  });
});

describe('isCommandAllowed', () => {
  it('accepts the exact command, tolerating only whitespace differences', () => {
    expect(isCommandAllowed('bun run lint', legal.allowedCommands)).toBe(true);
    expect(isCommandAllowed('  bun   run lint ', legal.allowedCommands)).toBe(true);
  });

  it('rejects prefixes, suffixes and anything else', () => {
    expect(isCommandAllowed('bun run lint --fix', legal.allowedCommands)).toBe(false);
    expect(isCommandAllowed('bun run lint; rm -rf /', legal.allowedCommands)).toBe(false);
    expect(isCommandAllowed('git push --force', legal.allowedCommands)).toBe(false);
  });
});

describe('branchNameFor', () => {
  it('turns a ticket key into a valid branch name the pipeline owns', () => {
    expect(branchNameFor('owner/legal#12')).toBe('zenthos/owner-legal-12');
    expect(isPipelineBranch(branchNameFor('owner/legal#12'))).toBe(true);
    expect(isPipelineBranch('staging')).toBe(false);
  });
});
