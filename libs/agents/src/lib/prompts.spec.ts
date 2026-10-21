import { PUBLISHED_PROMPTS, promptAddress } from './prompts.js';

describe('published prompts', () => {
  it('address each version as a LangFuse name and label, one name per prompt', () => {
    expect(promptAddress('spec-writer/v1')).toEqual({ name: 'spec-writer', label: 'v1' });
    expect(() => promptAddress('spec-writer')).toThrow('name/label');
    const names = PUBLISHED_PROMPTS.map((p) => promptAddress(p.version).name);
    expect(new Set(names).size).toBe(names.length);
    for (const p of PUBLISHED_PROMPTS) expect(p.text.length).toBeGreaterThan(100);
  });
});
