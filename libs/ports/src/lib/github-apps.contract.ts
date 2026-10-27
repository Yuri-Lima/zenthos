import assert from 'node:assert/strict';
import type { GitHubAppsPort } from './github-apps.port.js';

/** What any implementation of the app-level GitHub calls must return; the live one is exercised by the flows themselves. */
export const githubAppsContract: Record<string, (port: GitHubAppsPort, fixture: { manifestCode: string; signInCode: string; installationId: number; repo: string }) => Promise<void>> = {
  'a manifest code becomes app credentials, a sign-in code a user, an installation id an installation, a repository its default branch and clone URL': async (port, { manifestCode, signInCode, installationId, repo }) => {
    const app = await port.exchangeManifestCode(manifestCode);
    assert.ok(app.appId && app.slug && app.privateKey && app.clientId && app.clientSecret);
    const user = await port.signInUser({ clientId: app.clientId, clientSecret: app.clientSecret }, signInCode, 'http://localhost/auth/github/callback');
    assert.ok(user.login.length > 0 && user.id > 0);
    const installation = await port.describeInstallation({ type: 'github-app', appId: app.appId, privateKey: app.privateKey }, installationId);
    assert.equal(installation.installationId, installationId);
    assert.ok(Array.isArray(installation.repositories));
    assert.ok((await port.whoAmI({ type: 'github-app', appId: app.appId, privateKey: app.privateKey })).length > 0);
    assert.ok(Array.isArray(await port.listInstallations({ type: 'github-app', appId: app.appId, privateKey: app.privateKey })));
    const info = await port.describeRepository({ type: 'github-app', appId: app.appId, privateKey: app.privateKey }, repo);
    assert.ok(info.defaultBranch.length > 0 && info.cloneUrl.length > 0);
  },
};
