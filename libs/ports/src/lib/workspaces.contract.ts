import assert from 'node:assert/strict';
import { createWorkspace } from '@zenthos/domain';
import type { WorkspacesPort } from './workspaces.port.js';

export const workspacesContract: Record<string, (port: WorkspacesPort) => Promise<void>> = {
  'a workspace and its members come back whole; roles change in place; logins match case-insensitively': async (port) => {
    const { workspace, membership } = createWorkspace(`Acme ${Date.now()}`, 'Octocat', new Date('2026-10-24T10:00:00Z'));
    await port.save(workspace);
    assert.deepEqual(await port.get(workspace.id), workspace);
    assert.ok((await port.unclaimed()).some((w) => w.id === workspace.id));
    await port.saveMember(membership);
    assert.ok(!(await port.unclaimed()).some((w) => w.id === workspace.id));
    assert.deepEqual(await port.listForLogin('octocat'), [{ workspace, role: 'owner' }]);
    await port.saveMember({ workspaceId: workspace.id, login: 'hubot', role: 'member', invitedBy: 'Octocat', createdAt: '2026-10-24T10:01:00.000Z' });
    await port.saveMember({ workspaceId: workspace.id, login: 'HUBOT', role: 'admin', invitedBy: 'Octocat', createdAt: '2026-10-24T10:02:00.000Z' });
    const members = await port.members(workspace.id);
    assert.deepEqual(members.map((m) => [m.login.toLowerCase(), m.role]), [['octocat', 'owner'], ['hubot', 'admin']]);
    await port.removeMember(workspace.id, 'hubot');
    assert.deepEqual((await port.members(workspace.id)).map((m) => m.login), ['Octocat']);
    assert.deepEqual(await port.listForLogin('hubot'), []);
    await port.save({ ...workspace, name: 'Acme Inc' });
    assert.equal((await port.get(workspace.id))?.name, 'Acme Inc');
    assert.equal(await port.get('00000000-0000-4000-8000-00000000dead'), undefined);
  },
};
