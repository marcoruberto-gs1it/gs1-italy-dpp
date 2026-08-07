import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, effect, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { I18nService } from '../../services/i18n.service';
import { LanguageService } from '../../services/language.service';
import { SiteOriginService } from '../../services/site-origin.service';
import { StructuredDataService } from '../../services/structured-data.service';
import { VOCABULARY_TERMS } from '../../data/vocabulary';

const JSON_LD_ID = 'vocabulary-term-structured-data';

@Component({
  selector: 'app-vocabulary-term',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './vocabulary-term.html',
  styleUrl: './vocabulary-term.css',
})
export class VocabularyTermComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private titleService = inject(Title);
  private metaService = inject(Meta);
  private siteOrigin = inject(SiteOriginService);
  private structuredData = inject(StructuredDataService);
  protected languageService = inject(LanguageService);
  protected t = inject(I18nService).t;

  private params = toSignal(this.route.paramMap);

  termParam = computed(() => this.params()?.get('term') || '');
  term = computed(() => VOCABULARY_TERMS.find((v) => v.term === this.termParam()));

  label = computed(() => {
    const term = this.term();
    if (!term) return this.termParam();
    return this.languageService.lang() === 'en' ? term.labelEn : term.labelIt;
  });

  comment = computed(() => {
    const term = this.term();
    if (!term) return '';
    return this.languageService.lang() === 'en' ? term.commentEn : term.commentIt;
  });

  usage = computed(() => {
    const term = this.term();
    if (!term) return '';
    return this.languageService.lang() === 'en' ? term.usageEn : term.usageIt;
  });

  /**
   * Descrizione RDFS del termine stesso, pubblicata sulla sua stessa pagina: è ciò che rende
   * "gs1it:{termine}" un identificatore realmente dereferenziabile, non solo una stringa che
   * punta a un dominio che risponde 200 senza dire nulla sul termine.
   */
  private jsonLd = computed(() => {
    const term = this.term();
    if (!term) return null;
    const origin = this.siteOrigin.value.replace(/\/$/, '');
    const id = `${origin}/voc/${term.term}`;
    const doc: Record<string, unknown> = {
      '@context': {
        rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
        gs1it: `${origin}/voc/`,
      },
      '@id': id,
      '@type': term.kind === 'Class' ? 'rdfs:Class' : 'rdf:Property',
      'rdfs:label': [
        { '@value': term.labelIt, '@language': 'it' },
        { '@value': term.labelEn, '@language': 'en' },
      ],
      'rdfs:comment': [
        { '@value': term.commentIt, '@language': 'it' },
        { '@value': term.commentEn, '@language': 'en' },
      ],
    };
    if (term.domain) doc['rdfs:domain'] = term.domain;
    if (term.range) doc['rdfs:range'] = term.range;
    return doc;
  });

  constructor() {
    effect(() => this.structuredData.apply(JSON_LD_ID, this.jsonLd()));

    // Rotta riusata cambiando :term (navigazione da un termine all'altro dall'indice /voc):
    // ngOnInit non verrebbe richiamato, serve un effect come in sector.ts.
    effect(() => {
      const term = this.term();
      this.titleService.setTitle(term ? `gs1it:${term.term} | ${this.t('voc.title')}` : this.t('voc.notFoundTitle'));
      this.metaService.updateTag({ name: 'description', content: term ? this.comment() : this.t('voc.notFoundTitle') });
    });
  }

  ngOnDestroy(): void {
    this.structuredData.remove(JSON_LD_ID);
  }
}
