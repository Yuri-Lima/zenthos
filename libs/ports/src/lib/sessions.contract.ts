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
  'a created session is found by its id and gone after removal': async (port) => {
    const session = sampleSession(`${Date.now()}`.padStart(64, 'b'));
    await port.create(session);
    assert.deepEqual(await port.get(session.id), session);
    assert.equal(await port.get('c'.repeat(64)), undefined);
    await port.remove(session.id);
    assert.equal(await port.get(session.id), undefined);
  },
};
