import assert from 'node:assert/strict';
import type { RepoProfile, Workspace } from '@zenthos/domain';
import type { ScmPort } from './scm.port.js';

export type ScmFixture = { port: ScmPort; profile: RepoProfile; workspace: Workspace };

/** What every merge-request host must do for the pipeline, whatever its API looks like. */
export const scmContract: Record<string, (fixture: ScmFixture) => Promise<void>> = {
  'an opened pull request is found again by its branch, has a readable diff, and takes a review': async ({ port, profile, workspace }) => {
    const opened = await port.openPullRequest({ profile, workspace, title: 'contract', body: 'contract', ticketKey: `${profile.repo}#1` });
    assert.ok(opened.number > 0 && opened.url.length > 0);
    assert.deepEqual(await port.findPullRequest(profile, workspace.branch), opened);
    assert.equal(await port.findPullRequest(profile, 'zenthos/no-such-branch'), undefined);
    const diff = await port.readPullRequestDiff(profile, opened);
    assert.ok(diff.files.length > 0 && diff.changedLines >= 0 && typeof diff.patch === 'string');
    await port.postReview({ profile, pullRequest: opened, body: '## Review' });
    assert.equal(await port.pullRequestState(profile, opened), 'open');
  },
};
