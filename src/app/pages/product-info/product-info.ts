import { Component, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { IconComponent } from '../../components/icon/icon';
import { setSocialMeta } from '../../utils/social-meta';
import { I18nService } from '../../services/i18n.service';
import { LanguageService } from '../../services/language.service';
import { SiteOriginService } from '../../services/site-origin.service';
import { DppRecord, RegistryApiService } from '../../services/registry-api.service';
import { ScrollRevealDirective } from '../../directives/scroll-reveal';
import { SECTORS, localizeSector } from '../../data/sectors';
import { DPP_LINK_TYPES, classifyAttribute, linkTypePath } from '../../data/dpp-link-types';

/**
 * Pagina "informazioni prodotto" (gs1:pip, https://ref.gs1.org/voc/pip) — distinta dalla pagina
 * passaporto (/01/:gtin, gs1:dpp): scheda consumer-facing semplice (nome, icona/descrizione del
 * settore), NESSUN dato di compliance (attributi dichiarati, registryId, GLN economicOperator/
 * facility) — quelli restano solo sulla pagina DPP. Vedi il commento su buildLinksetDocument in
 * registry-api/src/resolverClient.ts per il perché delle due pagine distinte: il resolver GS1
 * deve poter offrire due linktype diversi con due URL realmente diversi, non lo stesso contenuto
 * con un'etichetta diversa.
 *
 * Generica (funziona per qualunque GTIN con una scheda DPP su registry-api, non solo i 10
 * statici): solo il resolver distingue i due linktype in base a record.isStatic, questa pagina
 * no — un secondo URL in più per un DPP utente è innocuo e non richiede una guardia dedicata qui.
 */
@Component({
  selector: 'app-product-info',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent, ScrollRevealDirective],
  templateUrl: './product-info.html',
  styleUrl: './product-info.css',
})
export class ProductInfoComponent {
  private route = inject(ActivatedRoute);
  private titleService = inject(Title);
  private metaService = inject(Meta);
  private siteOrigin = inject(SiteOriginService);
  private registryApi = inject(RegistryApiService);
  private languageService = inject(LanguageService);
  private platformId = inject(PLATFORM_ID);
  protected t = inject(I18nService).t;

  private routeParams = toSignal(this.route.paramMap);
  gtin = computed(() => this.routeParams()?.get('gtin') ?? null);

  record = signal<DppRecord | null>(null);
  loading = signal(false);
  notFound = signal(false);

  sector = computed(() => {
    const record = this.record();
    if (!record) return null;
    const base = SECTORS.find((s) => s.id === record.sectorId) ?? SECTORS[0];
    return localizeSector(base, this.languageService.lang());
  });

  /** Sezioni del passaporto che esistono davvero per questo prodotto, ciascuna con il proprio
   * link type GS1: la scheda informativa resta semplice e rimanda al dettaglio (solo titoli e
   * link — nessun valore dichiarato, quelli restano sulla pagina DPP). */
  protected pathOf = linkTypePath;

  moreSections = computed(() => {
    const record = this.record();
    if (!record) return [];
    const present = new Set(Object.keys(record.attributes ?? {}).map(classifyAttribute));
    const wanted = ['sustainabilityInfo', 'certificationInfo', 'safetyInfo', 'instructions', 'masterData', 'traceability'];
    return DPP_LINK_TYPES.filter((lt) => wanted.includes(lt.id) && (['masterData', 'traceability'].includes(lt.id) || present.has(lt.id as never)));
  });

  constructor() {
    // Solo lato browser, stesso motivo di ProductComponent: registry-api non esiste durante il
    // prerender (vedi il commento in product.ts).
    if (isPlatformBrowser(this.platformId)) {
      effect(() => {
        const gtin = this.gtin();
        this.record.set(null);
        this.notFound.set(false);
        if (!gtin) return;
        this.loading.set(true);
        this.registryApi.getPublicByGtin(gtin).subscribe({
          next: (record) => {
            this.loading.set(false);
            this.record.set(record);
          },
          error: () => {
            this.loading.set(false);
            this.notFound.set(true);
          },
        });
      });
    }

    effect(() => {
      const record = this.record();
      const sector = this.sector();
      if (!record) return;
      this.titleService.setTitle(`${record.name} | ${this.t('hero.pageTitle')}`);
      this.metaService.updateTag({ name: 'description', content: sector?.description ?? record.name });
      setSocialMeta(this.metaService, {
        title: record.name,
        description: sector?.description ?? record.name,
        url: `${this.siteOrigin.value}/product-info/${record.gtin}`,
      });
    });
  }

}
