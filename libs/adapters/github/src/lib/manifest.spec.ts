import { githubAppManifest, manifestFormUrl } from './manifest.js';

describe('githubAppManifest', () => {
  it('points the webhook and the callbacks at the API and asks for the documented permissions', () => {
    const manifest = githubAppManifest({ name: 'zenthos-dev', baseUrl: 'https://api.example.test', connectionId: 'abc' });
    expect(manifest.hook_attributes.url).toBe('https://api.example.test/webhooks/github');
    expect(manifest.redirect_url).toBe('https://api.example.test/providers/github/manifest/callback');
    expect(manifest.callback_urls).toEqual(['https://api.example.test/auth/github/callback']);
    expect(manifest.setup_url).toBe('https://api.example.test/providers/github/install/callback?connection=abc');
    expect(manifest.default_permissions).toEqual({ contents: 'write', issues: 'write', pull_requests: 'write', metadata: 'read' });
    expect(manifest.default_events).toEqual(['issues']);
    expect(manifestFormUrl('s1')).toBe('https://github.com/settings/apps/new?state=s1');
    expect(manifestFormUrl('s1', 'acme')).toBe('https://github.com/organizations/acme/settings/apps/new?state=s1');
  });
});
