import assert from 'node:assert/strict';
import type { Session } from '@zenthos/domain';
import type { SessionsPort } from './sessions.port.js';

export const sampleSession = (id = 'a'.repeat(64)): Session => ({
  id,
  user: { login: 'octocat', id: 583231, avatarUrl: 'https://avatars.githubusercontent.com/u/583231' },
  createdAt: '2026-10-18T10:00:00.000Z',
  expiresAt: '2026-10-25T10:00:00.000Z',
});

export const sessionsContract: Record<string, (port: SessionsPort) => Promise<void>> = {
  'a saved session is found by its id, save replaces it, and it is gone after removal': async (port) => {
    const session = sampleSession(`${Date.now()}`.padStart(64, 'b'));
    await port.save(session);
    assert.deepEqual(await port.get(session.id), session);
    await port.save({ ...session, workspaceId: '00000000-0000-4000-8000-000000000001' });
    assert.equal((await port.get(session.id))?.workspaceId, '00000000-0000-4000-8000-000000000001');
    assert.equal(await port.get('c'.repeat(64)), undefined);
    await port.remove(session.id);
    assert.equal(await port.get(session.id), undefined);
  },
};
