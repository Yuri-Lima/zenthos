import { loadConfig } from './config.js';

const github = { ISSUE_TRACKER: 'github', SCM: 'github' };

describe('worker config', () => {
  it('runs GitHub adapters on the platform app when a store is configured, without GitHub credentials in the environment', () => {
    const config = loadConfig({ ...github, DATABASE_URL: 'postgres://postgres:x@db:5432/zenthos', ZENTHOS_SECRETS_KEY: 'a'.repeat(64) });
    expect(config.SCM).toBe('github');
  });

  it('refuses GitHub adapters without a store and without credentials, and accepts a token for a dry run', () => {
    expect(() => loadConfig(github)).toThrow(/DATABASE_URL/);
    expect(loadConfig({ ...github, GITHUB_TOKEN: 'ghp_test' }).GITHUB_TOKEN).toBe('ghp_test');
  });
});
