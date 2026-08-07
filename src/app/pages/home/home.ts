import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { SECTORS, Sector, localizeSector } from '../../data/sectors';
import { UiStateService } from '../../services/ui-state.service';
import { LanguageService } from '../../services/language.service';
import { I18nService } from '../../services/i18n.service';
import { SiteOriginService } from '../../services/site-origin.service';
import { StructuredDataService } from '../../services/structured-data.service';
import { GS1_ITALY_LOGO, organizationId } from '../organization/organization';

const JSON_LD_ID = 'home-structured-data';

@Component({
  selector: 'app-home',
  imports: [CommonModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnDestroy {
  protected uiState = inject(UiStateService);
  private languageService = inject(LanguageService);
  protected t = inject(I18nService).t;
  private structuredData = inject(StructuredDataService);
  private siteOrigin = inject(SiteOriginService);
  private titleService = inject(Title);
  private metaService = inject(Meta);

  sectors = computed<Sector[]>(() => SECTORS.map((s) => localizeSector(s, this.languageService.lang())));

  /**
   * Dati strutturati della home: la stessa griglia di settori che si vede in pagina,
   * dichiarata come ItemList perché una macchina non debba dedurla dal markup.
   *
   * Volutamente solo nome e URL: le voci sono metadato di navigazione, non schede
   * prodotto. I 16 prodotti che non pubblicano dati strutturati devono continuare a non
   * pubblicarne — è il contrasto su cui poggia la demo — e un indice che ne descrivesse
   * gli attributi lo annullerebbe.
   *
   * Niente dateModified: non esiste una data di modifica reale del contenuto (non è un
   * CMS con revisioni), e inventarne una sarebbe un dato falso pubblicato come se fosse
   * vero — peggio che ometterlo, specie su un sito che dimostra proprio l'affidabilità
   * dei dati strutturati.
   */
  private homeJsonLd = computed(() => {
    const origin = this.siteOrigin.value.replace(/\/$/, '');
    return {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${origin}/`,
      url: `${origin}/`,
      name: `${this.t('hero.titleLine1')} ${this.t('hero.titleHighlight')}`,
      description: this.t('hero.subtitle'),
      inLanguage: this.languageService.lang(),
      image: GS1_ITALY_LOGO,
      // Stesso @id del nodo Organization canonico pubblicato su /organizzazione (vedi
      // organization.ts) — un consumer Linked-Data lo riconosce come lo stesso nodo, stessa
      // deduplicazione già applicata a brand e organismi di certificazione nel knowledge graph.
      // name/url restano inline (non solo {"@id": ...}) perché un validator schema.org che non
      // dereferenzia l'@id (la norma per i tool SEO, a differenza di un motore RDF) deve poter
      // leggere comunque chi è il publisher da questo solo documento.
      publisher: { '@id': organizationId(origin), '@type': 'Organization', name: 'GS1 Italy', url: 'https://www.gs1it.org/' },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: this.sectors().length,
        itemListElement: this.sectors().map((sector, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: sector.name,
          url: `${origin}/catalog/${sector.id}`,
        })),
      },
    };
  });

  constructor() {
    effect(() => this.structuredData.apply(JSON_LD_ID, this.homeJsonLd()));

    // Titolo/meta reattivi alla lingua (non in ngOnInit): il toggle IT/EN non ricrea il
    // componente, quindi senza questo il tag description resterebbe in inglese dopo un
    // cambio lingua da EN a IT.
    effect(() => {
      this.titleService.setTitle(`${this.t('hero.titleLine1')} ${this.t('hero.titleHighlight')}`);
      this.metaService.updateTag({ name: 'description', content: this.t('hero.subtitle') });
    });
  }

  ngOnDestroy(): void {
    // Navigando altrove il componente viene distrutto prima che l'effect possa ripulire:
    // senza questo, il blocco della home resterebbe nella pagina successiva.
    this.structuredData.remove(JSON_LD_ID);
  }
}
