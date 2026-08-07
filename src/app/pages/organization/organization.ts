import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { I18nService } from '../../services/i18n.service';
import { SiteOriginService } from '../../services/site-origin.service';
import { StructuredDataService } from '../../services/structured-data.service';

const JSON_LD_ID = 'organization-structured-data';
export const GS1_ITALY_LOGO = 'https://static.gs1it.org/static/images/logo/gs1it.1ea986161973.png';

/**
 * Nodo Organization canonico per GS1 Italy — pensato per essere referenziato con {"@id": ...} da
 * chi altrove nel sito pubblica "publisher": GS1 Italy (home, settori), invece di ripetere lo
 * stesso oggetto inline in ogni pagina: stesso principio di deduplicazione già applicato a
 * brand e organismi di certificazione (vedi generate-knowledge-graph.js).
 *
 * Solo fatti verificati sul sito reale (gs1it.org/chi-siamo): nome, sede, P.IVA/Codice Fiscale
 * (già pubblicati in footer), sito ufficiale. Nessun dato inventato — niente gs1:globalLocationNumber
 * perché non è pubblicamente verificabile da qui.
 */
export function organizationId(origin: string): string {
  return `${origin.replace(/\/$/, '')}/organizzazione`;
}

export function buildOrganizationJsonLd(origin: string): object {
  return {
    '@context': { schema: 'https://schema.org/', gs1: 'https://ref.gs1.org/voc/', '@vocab': 'https://schema.org/' },
    '@id': organizationId(origin),
    '@type': ['Organization', 'gs1:Organization'],
    name: 'GS1 Italy',
    'gs1:organizationName': [{ '@value': 'GS1 Italy', '@language': 'it' }],
    url: 'https://www.gs1it.org/',
    logo: GS1_ITALY_LOGO,
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Via Paleocapa 7',
      postalCode: '20121',
      addressLocality: 'Milano',
      addressCountry: 'IT',
    },
    taxID: '80140330152',
  };
}

@Component({
  selector: 'app-organization',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './organization.html',
  styleUrl: './organization.css',
})
export class OrganizationComponent implements OnInit, OnDestroy {
  private titleService = inject(Title);
  private metaService = inject(Meta);
  private siteOrigin = inject(SiteOriginService);
  private structuredData = inject(StructuredDataService);
  protected t = inject(I18nService).t;

  protected logo = GS1_ITALY_LOGO;

  // Fatti statici, indipendenti dalla lingua (nome proprio, indirizzo, P.IVA): a differenza del
  // testo descrittivo in pagina (via t()), questo nodo non cambia al cambio lingua — un
  // Organization/PostalAddress non ha una versione "in inglese".
  private jsonLd = computed(() => buildOrganizationJsonLd(this.siteOrigin.value));

  constructor() {
    effect(() => this.structuredData.apply(JSON_LD_ID, this.jsonLd()));
  }

  ngOnInit(): void {
    this.titleService.setTitle(this.t('org.pageTitle'));
    this.metaService.updateTag({ name: 'description', content: this.t('org.metaDescription') });
  }

  ngOnDestroy(): void {
    this.structuredData.remove(JSON_LD_ID);
  }
}
