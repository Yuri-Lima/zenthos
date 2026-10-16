import { SecretBox } from './secret-box.js';

const key = 'a'.repeat(64);

describe('SecretBox', () => {
  it('round-trips a value and never stores it in clear', () => {
    const box = new SecretBox(key);
    const sealed = box.seal({ token: 'ghp_secret' });
    expect(sealed.toString('latin1')).not.toContain('ghp_secret');
    expect(box.open(sealed)).toEqual({ token: 'ghp_secret' });
    expect(box.seal({ token: 'x' }).equals(box.seal({ token: 'x' }))).toBe(false);
  });

  it('refuses a tampered box and a wrong key', () => {
    const box = new SecretBox(key);
    const sealed = box.seal('s');
    sealed[sealed.length - 1] ^= 1;
    expect(() => box.open(sealed)).toThrow();
    expect(() => new SecretBox('b'.repeat(64)).open(box.seal('s'))).toThrow();
    expect(() => new SecretBox('short')).toThrow(/64 hex/);
  });
});
