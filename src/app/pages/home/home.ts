import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SECTORS, Sector, localizeSector } from '../../data/sectors';
import { UiStateService } from '../../services/ui-state.service';
import { LanguageService } from '../../services/language.service';
import { I18nService } from '../../services/i18n.service';
import { SiteOriginService } from '../../services/site-origin.service';
import { StructuredDataService } from '../../services/structured-data.service';

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

  sectors = computed<Sector[]>(() => SECTORS.map((s) => localizeSector(s, this.languageService.lang())));

  /**
   * Dati strutturati della home: la stessa griglia di settori che si vede in pagina,
   * dichiarata come ItemList perché una macchina non debba dedurla dal markup.
   *
   * Volutamente solo nome e URL: le voci sono metadato di navigazione, non schede
   * prodotto. I 16 prodotti che non pubblicano dati strutturati devono continuare a non
   * pubblicarne — è il contrasto su cui poggia la demo — e un indice che ne descrivesse
   * gli attributi lo annullerebbe.
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
  }

  ngOnDestroy(): void {
    // Navigando altrove il componente viene distrutto prima che l'effect possa ripulire:
    // senza questo, il blocco della home resterebbe nella pagina successiva.
    this.structuredData.remove(JSON_LD_ID);
  }
}
