import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Tree = { [key: string]: string | Tree };
const load = (lang: string) => JSON.parse(readFileSync(join(__dirname, `../../../public/i18n/${lang}.json`), 'utf8')) as Tree;
const keys = (tree: Tree, prefix = ''): string[] => Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`)));

/** Glossary text is English in the domain and only translated here (ADR 014); glossary-page.spec checks those keys. */
const uiKeys = (lang: string) => keys(load(lang)).filter((k) => !k.startsWith('glossary.') && !k.startsWith('glossaryTitle.')).sort();

describe('translations', () => {
  it('English and Portuguese have exactly the same interface keys', () => {
    const en = uiKeys('en');
    const pt = uiKeys('pt');
    expect(pt.filter((k) => !en.includes(k))).toEqual([]);
    expect(en.filter((k) => !pt.includes(k))).toEqual([]);
  });
});
