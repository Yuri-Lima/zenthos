/**
 * The platform GitHub App the operator creates once (ADR 007, ADR 019): public, so any account or organisation can
 * install it; the permissions docs/authentication.md lists, plus organisation members read, which lets the API
 * check that whoever claims an installation belongs to the organisation; the webhook and the install callback
 * pointed at the API.
 */
export function githubAppManifest({ name, baseUrl }: { name: string; baseUrl: string }) {
  return {
    name,
    url: baseUrl,
    public: true,
    redirect_url: `${baseUrl}/platform/github/manifest/callback`,
    /** Where GitHub sends a person back after Sign in with GitHub (ADR 007). */
    callback_urls: [`${baseUrl}/auth/github/callback`],
    setup_url: `${baseUrl}/github/install/callback`,
    setup_on_update: true,
    hook_attributes: { url: `${baseUrl}/webhooks/github`, active: true },
    default_permissions: { contents: 'write', issues: 'write', pull_requests: 'write', metadata: 'read', members: 'read' },
    // Installation events reach every app without subscribing; GitHub refuses them in a manifest's default_events.
    default_events: ['issues'],
  };
}

/** The GitHub page that creates the app from the manifest; `state` comes back on the redirect. */
export const manifestFormUrl = (state: string, owner?: string) =>
  owner ? `https://github.com/organizations/${owner}/settings/apps/new?state=${state}` : `https://github.com/settings/apps/new?state=${state}`;
