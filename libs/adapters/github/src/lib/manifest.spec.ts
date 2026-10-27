import { githubAppManifest, manifestFormUrl } from './manifest.js';

describe('githubAppManifest', () => {
  it('points the webhook and the callbacks at the API and asks for the documented permissions', () => {
    const manifest = githubAppManifest({ name: 'zenthos-dev', baseUrl: 'https://api.example.test' });
    expect(manifest.hook_attributes.url).toBe('https://api.example.test/webhooks/github');
    expect(manifest.callback_urls).toEqual(['https://api.example.test/auth/github/callback']);
    expect(manifest.setup_url).toBe('https://api.example.test/github/install/callback');
    expect(manifest.redirect_url).toBe('https://api.example.test/platform/github/manifest/callback');
    expect(manifest.public).toBe(true);
    expect(manifest.default_permissions).toEqual({ contents: 'write', issues: 'write', pull_requests: 'write', metadata: 'read', members: 'read' });
    expect(manifest.default_events).toEqual(['issues']);
    expect(manifestFormUrl('s1')).toBe('https://github.com/settings/apps/new?state=s1');
    expect(manifestFormUrl('s1', 'acme')).toBe('https://github.com/organizations/acme/settings/apps/new?state=s1');
  });
});
