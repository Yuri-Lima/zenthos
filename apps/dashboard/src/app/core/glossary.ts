import { inject, Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import type { paths } from '@zenthos/api-client';
import { API } from './api';

type GlossaryResponse = paths['/glossary']['get']['responses'][200]['content']['application/json'];
export type Term = GlossaryResponse['terms'][number];

/** The knowledge base, loaded once from the API; definitions in the person's language when a translation exists, else the domain's English. */
@Injectable({ providedIn: 'root' })
export class GlossaryService {
  private readonly api = inject(API);
  private readonly translate = inject(TranslateService);
  readonly terms = signal<Term[]>([]);
  readonly edges = signal<GlossaryResponse['edges']>([]);
  private loading?: Promise<void>;

  constructor() {
    void this.load();
  }

  load(): Promise<void> {
    this.loading ??= this.api.GET('/glossary').then(({ data }) => {
      this.terms.set(data?.terms ?? []);
      this.edges.set(data?.edges ?? []);
    });
    return this.loading;
  }

  term(id: string): Term | undefined {
    return this.terms().find((t) => t.id === id);
  }

  /** The translated definition when the i18n file has one, else the canonical English from the domain. */
  definition(term: Term): string {
    const key = `glossary.${term.id}`;
    const translated = this.translate.instant(key) as string;
    return translated && translated !== key ? translated : term.definition;
  }

  /** The definition for a tooltip: empty until the glossary has loaded or when the id is unknown. */
  tip(id: string): string {
    const term = this.term(id);
    return term ? this.definition(term) : '';
  }

  title(term: Term): string {
    const key = `glossaryTitle.${term.id}`;
    const translated = this.translate.instant(key) as string;
    return translated && translated !== key ? translated : term.title;
  }
}
