import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { API, installUrl } from '../core/api';
import { SettingsPage } from './settings-page';

const ok = { ok: true, status: 200 } as Response;
const platform = { configured: true, slug: 'zenthos', installUrl: 'https://github.com/apps/zenthos/installations/new' };
const installation = { installationId: 3, account: 'o', repositories: ['o/r', 'o/s'], workspaceId: '00000000-0000-4000-8000-000000000001' };
const profile = (repo: string) => ({ repo, cloneUrl: `https://github.com/${repo}.git`, baseBranch: 'main', allowedCommands: ['bun install', 'bun run lint'], gateCommands: ['bun run lint'], policy: { costCeilingUsd: 15, diffBudgetLines: 800, forbiddenPathPrefixes: [], maxImplementRounds: 2, reviewThreshold: 3.5, maxReviewRounds: 1 } });

const noKey = { configured: false };
const storedKey = { configured: true, provider: 'anthropic', last4: '1234', createdAt: '2026-10-27T10:00:00.000Z' };

/** A fake API: the key store accepts every key but `rejected`, as the in-memory provider does, and answers with its status. */
function setup(status: unknown, installations: unknown[], profiles: unknown[], modelKey: unknown = noKey) {
  const deletes: string[] = [];
  const puts: unknown[] = [];
  let key = modelKey;
  const api = {
    GET: async (path: string) => ({ data: path === '/platform' ? status : path === '/github/installations' ? installations : path === '/model-key' ? key : profiles, response: ok }),
    PUT: async (path: string, { body }: { body: { apiKey: string } }) => {
      puts.push(body);
      if (body.apiKey === 'rejected') return { error: { message: 'The model provider rejected this API key' }, response: { ok: false, status: 400 } as Response };
      key = { ...storedKey, last4: body.apiKey.slice(-4) };
      return { data: key, response: ok };
    },
    DELETE: async (path: string) => {
      deletes.push(path);
      if (path === '/model-key') key = noKey;
      return { response: ok };
    },
  };
  TestBed.configureTestingModule({ imports: [SettingsPage, TranslateModule.forRoot()], providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: API, useValue: api }] });
  return { fixture: TestBed.createComponent(SettingsPage), deletes, puts };
}

const settle = async (fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) => {
  await fixture.whenStable();
  fixture.detectChanges();
};

describe('SettingsPage', () => {
  it('derives the first-run steps from what exists: nothing installed, no key, no repository; the install link goes through the API', async () => {
    const { fixture } = setup(platform, [], []);
    await settle(fixture);
    expect(fixture.componentInstance.setup().map((s) => [s.key, s.done])).toEqual([['install', false], ['key', false], ['repo', false]]);
    expect(fixture.componentInstance.nextStep()).toBe('install');
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.setup')).not.toBeNull();
    expect(host.textContent).toContain('zenthos');
    const link = host.querySelector(`a[href="${installUrl()}"]`);
    expect(link?.textContent).toContain('settings.install');
    expect(host.textContent).toContain('settings.notInstalled');
    fixture.destroy();
  });

  it('says so when the platform app is not set up, and offers no install link', async () => {
    const { fixture } = setup({ configured: false }, [], []);
    await settle(fixture);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('settings.noPlatform');
    expect(host.querySelector(`a[href="${installUrl()}"]`)).toBeNull();
    expect(host.querySelector('.setup')).toBeNull();
    fixture.destroy();
  });

  it('shows which installation covers a repository, warns where none does, and releases an installation', async () => {
    const { fixture, deletes } = setup(platform, [installation], [profile('o/r'), profile('x/y')], storedKey);
    await settle(fixture);
    const page = fixture.componentInstance;
    expect(page.coveredBy(profile('o/r') as never)).toBe('o');
    expect(page.coveredBy(profile('x/y') as never)).toBeUndefined();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('mat-icon.warn')).toHaveLength(1);
    expect(page.setupDone()).toBe(true);
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await page.release(installation as never);
    expect(deletes).toEqual(['/github/installations/{id}']);
    fixture.destroy();
  });

  it('takes the model key through the form, shows the refusal, then only the tail of a stored key, and removes it', async () => {
    const { fixture, deletes, puts } = setup(platform, [installation], []);
    await settle(fixture);
    const page = fixture.componentInstance;
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('settings.modelKey.none');
    expect(host.querySelector('input[name="apiKey"]')).not.toBeNull();

    page.apiKey.set('rejected');
    await page.saveKey();
    await settle(fixture);
    expect(page.keyError()).toBe('The model provider rejected this API key');
    expect(page.modelKey()).toEqual(noKey);

    page.apiKey.set('sk-ant-api03-secret-5678');
    await page.saveKey();
    await settle(fixture);
    expect(puts).toEqual([{ apiKey: 'rejected' }, { apiKey: 'sk-ant-api03-secret-5678' }]);
    expect(page.modelKey()).toMatchObject({ configured: true, last4: '5678' });
    expect(page.apiKey()).toBe('');
    expect(host.textContent).toContain('5678');
    expect(host.textContent).not.toContain('secret');
    expect(host.querySelector('input[name="apiKey"]')).toBeNull();
    expect(page.setup().find((s) => s.key === 'key')?.done).toBe(true);

    page.editingKey.set(true);
    await settle(fixture);
    expect(host.querySelector('input[name="apiKey"]')).not.toBeNull();
    page.cancelKey();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await page.removeKey();
    await settle(fixture);
    expect(deletes).toEqual(['/model-key']);
    expect(host.querySelector('input[name="apiKey"]')).not.toBeNull();
    fixture.destroy();
  });

  it('shows six repositories of an installation with the total, and the rest on request', async () => {
    const repositories = Array.from({ length: 10 }, (_, i) => `o/repo-${String.fromCharCode(106 - i)}`);
    const { fixture } = setup(platform, [{ ...installation, repositories }], []);
    await settle(fixture);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('span.repo-chip')).toHaveLength(6);
    expect(host.querySelector('span.repo-chip')?.textContent?.trim()).toBe('o/repo-a');
    expect(host.querySelector('button.repo-chip')?.textContent).toContain('settings.moreRepos');
    fixture.componentInstance.toggleRepos(3);
    await settle(fixture);
    expect(host.querySelectorAll('span.repo-chip')).toHaveLength(10);
    expect(host.querySelector('button.repo-chip')?.textContent).toContain('settings.fewerRepos');
    fixture.destroy();
  });
});
