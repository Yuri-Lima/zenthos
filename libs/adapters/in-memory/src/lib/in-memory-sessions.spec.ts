import { sessionsContract } from '@zenthos/ports';
import { InMemorySessions } from './in-memory-sessions.js';

describe('InMemorySessions', () => {
  for (const [name, check] of Object.entries(sessionsContract)) it(name, () => check(new InMemorySessions()));
});
