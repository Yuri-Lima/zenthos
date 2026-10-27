import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { DEFAULT_POLICY, TOOLING_PATH_PREFIXES } from '@zenthos/domain';
import { API } from '../core/api';
import { RepoFormPage } from './repo-form-page';

const ok = { ok: true, status: 200 } as Response;
const app = { id: '0bab83fe-b715-469c-8ead-54ba81b10157', provider: 'github', name: 'zenthos-yl', kind: 'github-app', appSlug: 'zenthos-yl', installUrl: 'https://github.com/apps/zenthos-yl/installations/new', installations: [{ installationId: 1, account: 'o', repositories: ['o/s', 'o/r'] }], createdAt: '2026-10-15T09:00:00.000Z' };

function setup(connections: unknown[]) {
  const puts: { path: unknown; body: { gateCommands: string[]; allowedCommands: string[]; policy: { forbiddenPathPrefixes: string[] } } }[] = [];
  const api = {
    GET: async (path: string) => ({ data: path === '/providers' ? connections : path.startsWith('/providers/') ? { defaultBranch: 'develop', cloneUrl: 'https://github.com/o/r.git' } : [], response: ok }),
    PUT: async (_: string, init: { params: { path: unknown }; body: (typeof puts)[number]['body'] }) => {
      puts.push({ path: init.params.path, body: init.body });
      return { response: ok };
    },
  };
  TestBed.configureTestingModule({ imports: [RepoFormPage, TranslateModule.forRoot()], providers: [provideZonelessChangeDetection(), provideRouter([{ path: 'settings', children: [] }]), { provide: API, useValue: api }] });
  return { fixture: TestBed.createComponent(RepoFormPage), puts };
}

describe('RepoFormPage', () => {
  it('starts from the domain defaults, keeps gates a subset of the allowed commands, and sends the profile', async () => {
    const { fixture, puts } = setup([]);
    await fixture.whenStable();
    const page = fixture.componentInstance;
    expect(page.form().costCeilingUsd).toBe(DEFAULT_POLICY.costCeilingUsd);
    expect(page.form().extraForbiddenText).toBe('migrations/');
    expect(page.coveredRepos()).toEqual([]);

    page.patch({ repo: 'o/r' });
    page.suggestCloneUrl();
    expect(page.form().cloneUrl).toBe('https://github.com/o/r.git');
    page.setAllowed('bun install\nbun run lint\n bun run lint \n');
    expect(page.allowed()).toEqual(['bun install', 'bun run lint']);
    page.toggleGate('bun run lint', true);
    page.setAllowed('bun install');
    expect(page.form().gates).toEqual([]);
    page.setAllowed('bun install\nbun run lint');
    page.toggleGate('bun run lint', true);
    expect(page.valid()).toBe(true);

    await page.save();
    expect(puts).toHaveLength(1);
    expect(puts[0].path).toEqual({ owner: 'o', name: 'r' });
    expect(puts[0].body.allowedCommands).toEqual(['bun install', 'bun run lint']);
    expect(puts[0].body.gateCommands).toEqual(['bun run lint']);
    expect(puts[0].body.policy.forbiddenPathPrefixes).toEqual(['migrations/']);
    expect(puts[0].body.policy.forbiddenPathPrefixes.some((p) => (TOOLING_PATH_PREFIXES as readonly string[]).includes(p))).toBe(false);
    fixture.destroy();
  });

  it('preselects the only connection, offers the repositories its app is installed on, and fills branch and clone URL from the provider', async () => {
    const { fixture } = setup([app]);
    await fixture.whenStable();
    const page = fixture.componentInstance;
    expect(page.form().connectionId).toBe(app.id);
    expect(page.coveredRepos()).toEqual(['o/r', 'o/s']);
    page.patch({ repo: 'o/S' });
    expect(page.matchingRepos()).toEqual(['o/s']);
    await page.pickRepository('o/r');
    expect(page.form()).toMatchObject({ repo: 'o/r', baseBranch: 'develop', cloneUrl: 'https://github.com/o/r.git' });
    expect(page.coverage()).toBe(true);
    fixture.destroy();
  });
});
