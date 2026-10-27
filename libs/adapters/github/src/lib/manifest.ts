/**
 * The GitHub App ZenthOs asks for when a self-hoster connects GitHub (ADR 007): the same permissions
 * docs/authentication.md lists for creating the app by hand, the webhook pointed at the API, and the
 * install callback carrying the connection id the manifest flow was started for.
 */
export function githubAppManifest({ name, baseUrl, connectionId }: { name: string; baseUrl: string; connectionId: string }) {
  return {
    name,
    url: baseUrl,
    public: false,
    redirect_url: `${baseUrl}/providers/github/manifest/callback`,
    /** Where GitHub sends a person back after Sign in with GitHub (ADR 007). */
    callback_urls: [`${baseUrl}/auth/github/callback`],
    setup_url: `${baseUrl}/providers/github/install/callback?connection=${connectionId}`,
    setup_on_update: true,
    hook_attributes: { url: `${baseUrl}/webhooks/github`, active: true },
    default_permissions: { contents: 'write', issues: 'write', pull_requests: 'write', metadata: 'read' },
    // Installation events reach every app without subscribing; GitHub refuses them in a manifest's default_events.
    default_events: ['issues'],
  };
}

/** The GitHub page that creates the app from the manifest; `state` comes back on the redirect. */
export const manifestFormUrl = (state: string, owner?: string) =>
  owner ? `https://github.com/organizations/${owner}/settings/apps/new?state=${state}` : `https://github.com/settings/apps/new?state=${state}`;
