import { claudeCodeEnv, credentialRefusal } from './credentials.js';

describe('credentialRefusal', () => {
  it('refuses any claude.ai subscription, whoever is signed in', () => {
    expect(credentialRefusal({ email: 'me@example.com', subscriptionType: 'Claude Max' }, {})).toContain('claude.ai subscription (Claude Max)');
    expect(credentialRefusal({ organization: 'Acme', subscriptionType: 'team' }, { ANTHROPIC_API_KEY: 'x' })).toContain('claude.ai subscription (team)');
  });

  it('accepts a Console sign-in and the credentials that come from the environment', () => {
    expect(credentialRefusal({ email: 'ops@example.com', organization: 'Acme' }, {})).toBeUndefined();
    expect(credentialRefusal({ tokenSource: 'none', apiProvider: 'firstParty' }, { ANTHROPIC_FEDERATION_RULE_ID: 'fdrl_1', ANTHROPIC_ORGANIZATION_ID: 'org' })).toBeUndefined();
    expect(credentialRefusal({ apiProvider: 'vertex' }, { CLAUDE_CODE_USE_VERTEX: '1' })).toBeUndefined();
  });

  it('refuses when there is no credential at all, with the way to get one', () => {
    expect(credentialRefusal({ tokenSource: 'none', apiProvider: 'firstParty' }, {})).toContain('coding-agent-login');
    // Federation needs both the rule and the organisation, as Claude Code does.
    expect(credentialRefusal({ tokenSource: 'none' }, { ANTHROPIC_FEDERATION_RULE_ID: 'fdrl_1' })).toContain('no organisation credential');
  });
});

describe('claudeCodeEnv', () => {
  it('points Claude Code at its own config directory and drops a subscription token', () => {
    const env = claudeCodeEnv('/srv/zenthos/claude-code', { OTEL_TRACES_EXPORTER: 'otlp' }, { PATH: '/bin', CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-x', CLAUDE_CONFIG_DIR: '/home/me/.claude' });
    expect(env).toEqual({ PATH: '/bin', OTEL_TRACES_EXPORTER: 'otlp', CLAUDE_CONFIG_DIR: '/srv/zenthos/claude-code' });
  });
});
