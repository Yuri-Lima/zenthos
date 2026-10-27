import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { API } from '../core/api';
import { SettingsPage } from './settings-page';

const ok = { ok: true, status: 200 } as Response;
const app = { id: '0bab83fe-b715-469c-8ead-54ba81b10157', provider: 'github', name: 'zenthos-yl', kind: 'github-app', appSlug: 'zenthos-yl', installUrl: 'https://github.com/apps/zenthos-yl/installations/new', installations: [], createdAt: '2026-10-15T09:00:00.000Z' };
const profile = { repo: 'o/r', cloneUrl: 'https://github.com/o/r.git', baseBranch: 'main', allowedCommands: ['bun install', 'bun run lint'], gateCommands: ['bun run lint'], policy: { costCeilingUsd: 15, diffBudgetLines: 800, forbiddenPathPrefixes: [], maxImplementRounds: 2, reviewThreshold: 3.5, maxReviewRounds: 1 }, connectionId: app.id };

function setup(profiles: unknown[]) {
  const posts: string[] = [];
  const api = {
    GET: async (path: string) => ({ data: path === '/providers' ? [app] : profiles, response: ok }),
    POST: async (path: string) => {
      posts.push(path);
      return { data: { ok: true, actsAs: 'zenthos-yl', repositories: 1, checkedAt: '2026-10-18T12:00:00.000Z' }, response: ok };
    },
  };
  TestBed.configureTestingModule({ imports: [SettingsPage, TranslateModule.forRoot()], providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: API, useValue: api }] });
  return { fixture: TestBed.createComponent(SettingsPage), posts };
}

const settle = async (fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) => {
  await fixture.whenStable();
  fixture.detectChanges();
};

describe('SettingsPage', () => {
  it('derives the first-run steps from what exists: connected, not installed, no repository', async () => {
    const { fixture } = setup([]);
    await settle(fixture);
    expect(fixture.componentInstance.setup().map((s) => [s.key, s.done])).toEqual([['connect', true], ['install', false], ['repo', false]]);
    expect(fixture.componentInstance.nextStep()).toBe('install');
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.setup')).not.toBeNull();
    expect(host.textContent).toContain('zenthos-yl');
    const link = host.querySelector('a[href="https://github.com/apps/zenthos-yl/installations/new"]');
    expect(link?.textContent).toContain('settings.install');
    expect(link?.classList).toContain('mat-mdc-unelevated-button');
    fixture.destroy();
  });

  it('checks a connection on demand and warns when its app is not installed on a profiled repository', async () => {
    const { fixture, posts } = setup([profile]);
    await settle(fixture);
    expect(fixture.componentInstance.coverage(profile as never)).toBe(false);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('mat-icon.warn')).not.toBeNull();
    await fixture.componentInstance.check(app as never);
    await settle(fixture);
    expect(posts).toEqual(['/providers/{id}/check']);
    expect(host.textContent).toContain('settings.checkOk');
    expect(host.textContent).toContain('settings.checkRepos');
    fixture.destroy();
  });
});

describe('SettingsPage repositories of an installation', () => {
  it('shows six of them with the total, and the rest on request', async () => {
    const repositories = Array.from({ length: 10 }, (_, i) => `o/repo-${String.fromCharCode(106 - i)}`);
    const api = { GET: async (path: string) => ({ data: path === '/providers' ? [{ ...app, installations: [{ installationId: 3, account: 'o', repositories }] }] : [], response: ok }), POST: async () => ({ data: undefined, response: ok }) };
    TestBed.configureTestingModule({ imports: [SettingsPage, TranslateModule.forRoot()], providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: API, useValue: api }] });
    const fixture = TestBed.createComponent(SettingsPage);
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

describe('SettingsPage install link', () => {
  it('turns into a quiet "manage repositories" link once the app is installed somewhere', async () => {
    const installed = { ...app, installations: [{ installationId: 1, account: 'o', repositories: ['o/r'] }] };
    const api = { GET: async (path: string) => ({ data: path === '/providers' ? [installed] : [], response: ok }) };
    TestBed.configureTestingModule({ imports: [SettingsPage, TranslateModule.forRoot()], providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: API, useValue: api }] });
    const fixture = TestBed.createComponent(SettingsPage);
    await settle(fixture);
    const link = (fixture.nativeElement as HTMLElement).querySelector(`a[href="${app.installUrl}"]`);
    expect(link?.textContent).toContain('settings.manage');
    expect(link?.classList).not.toContain('mat-mdc-unelevated-button');
    fixture.destroy();
  });
});
