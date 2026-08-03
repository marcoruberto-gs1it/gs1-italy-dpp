import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Product, ProductService, isAiReady, isVerified, getVocabularies, discountPercent, formatEuro } from '../../services/product.service';
import { UiStateService } from '../../services/ui-state.service';
import { SECTORS, localizeSector } from '../../data/sectors';
import { onImageError } from '../../utils/image-fallback';
import { IconComponent } from '../../components/icon/icon';
import { LanguageService } from '../../services/language.service';
import { I18nService } from '../../services/i18n.service';
import { SiteOriginService } from '../../services/site-origin.service';
import { StructuredDataService } from '../../services/structured-data.service';

const JSON_LD_ID = 'sector-structured-data';

type FilterMode = 'all' | 'ai-ready' | 'verified';
type SortMode = 'name' | 'gtin';

@Component({
  selector: 'app-sector',
  imports: [CommonModule, RouterLink, IconComponent],
  templateUrl: './sector.html',
  styleUrl: './sector.css',
})
export class Sector implements OnDestroy {
  private route = inject(ActivatedRoute);
  private productService = inject(ProductService);
  protected uiState = inject(UiStateService);
  private languageService = inject(LanguageService);
  protected t = inject(I18nService).t;
  private structuredData = inject(StructuredDataService);
  private siteOrigin = inject(SiteOriginService);

  protected isAiReady = isAiReady;
  protected isVerified = isVerified;
  protected getVocabularies = getVocabularies;
  protected onImageError = onImageError;
  protected discountPercent = discountPercent;
  protected formatEuro = formatEuro;

  private params = toSignal(this.route.paramMap);

  sectorId = computed(() => this.params()?.get('sector') || '');

  sectorInfo = computed(() => {
    const sector = SECTORS.find((s) => s.id === this.sectorId());
    return sector ? localizeSector(sector, this.languageService.lang()) : undefined;
  });

  allProducts = computed<Product[]>(() => this.productService.getProductsBySector(this.sectorId()));

  sectorName = computed(() => this.allProducts()[0]?.sectorName ?? this.sectorInfo()?.name ?? this.t('sector.notFound'));

  filter = signal<FilterMode>('all');
  sort = signal<SortMode>('name');

  filteredProducts = computed<Product[]>(() => {
    let list = this.allProducts();
    const mode = this.filter();
    if (mode === 'ai-ready') list = list.filter(isAiReady);
    if (mode === 'verified') list = list.filter(isVerified);

    const sortMode = this.sort();
    return [...list].sort((a, b) =>
      sortMode === 'name' ? a.name.localeCompare(b.name) : a.gtin.localeCompare(b.gtin)
    );
  });

  aiReadyCount = computed(() => this.allProducts().filter(isAiReady).length);
  verifiedCount = computed(() => this.allProducts().filter(isVerified).length);
  gs1VocabCount = computed(() => this.allProducts().filter((p) => getVocabularies(p).includes('gs1')).length);
  schemaVocabCount = computed(() => this.allProducts().filter((p) => getVocabularies(p).includes('schema')).length);

  setFilter(mode: FilterMode): void {
    this.filter.set(mode);
  }

  setSort(mode: SortMode): void {
    this.sort.set(mode);
  }

  viewJsonLd(product: Product, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.uiState.openJsonLd(product);
  }

  /**
   * Dati strutturati della pagina settore: le briciole di navigazione già visibili in alto
   * e l'indice dei prodotti del settore, ciascuno col proprio GS1 Digital Link.
   *
   * Le voci portano solo nome e URL — sono un indice, non schede prodotto. La scheda la
   * pubblica la pagina del prodotto, e solo se quel prodotto ha davvero dati strutturati.
   */
  private sectorJsonLd = computed(() => {
    const origin = this.siteOrigin.value.replace(/\/$/, '');
    const products = this.allProducts();
    if (!products.length) return null;

    const sectorUrl = `${origin}/catalog/${this.sectorId()}`;

    return {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': sectorUrl,
      url: sectorUrl,
      name: this.sectorName(),
      inLanguage: this.languageService.lang(),
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: this.t('nav.home'), item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: this.sectorName(), item: sectorUrl },
        ],
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: products.length,
        itemListElement: products.map((product, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: product.name,
          url: `${origin}/01/${product.gtin}`,
        })),
      },
    };
  });

  constructor() {
    effect(() => this.structuredData.apply(JSON_LD_ID, this.sectorJsonLd()));
  }

  ngOnDestroy(): void {
    this.structuredData.remove(JSON_LD_ID);
  }
}
