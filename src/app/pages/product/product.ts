import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ProductService, productImages, discountPercent, formatEuro, pricePerKg, formatNetContent } from '../../services/product.service';
import { StarRatingComponent } from '../../components/star-rating/star-rating';
import { JsonLdDrawerComponent } from '../../components/json-ld-drawer/json-ld-drawer';
import { onImageError } from '../../utils/image-fallback';
import { I18nService } from '../../services/i18n.service';
import { SiteOriginService, SSR_FALLBACK_ORIGIN } from '../../services/site-origin.service';
import { StructuredDataService } from '../../services/structured-data.service';

// Stesso placeholder salvato in products.json per gli @id coniati (rawGs1Data.brand['@id']),
// vedi generate-agent-feed.js: risolto qui verso l'origine reale con lo stesso principio.
const PLACEHOLDER_ORIGIN = SSR_FALLBACK_ORIGIN;

// gs1:AllergenTypeCode-* / gs1:LevelOfContainmentCode-* → chiave di traduzione in product.*
// (vedi src/app/i18n/translations.ts). Copre solo i codici realmente usati da add-gs1-jsonld.js
// per i 25 prodotti del catalogo.
const ALLERGEN_CODE_KEYS: Record<string, string> = {
  GLUTEN: 'allergenGluten',
  MILK: 'allergenMilk',
  EGGS: 'allergenEggs',
  TREE_NUTS: 'allergenTreeNuts',
  PEANUTS: 'allergenPeanuts',
  SOYBEANS: 'allergenSoybeans',
  SESAME_SEEDS: 'allergenSesameSeeds',
  CELERY: 'allergenCelery',
  MUSTARD: 'allergenMustard',
  LUPINE: 'allergenLupine',
  FISH: 'allergenFish',
  CRUSTACEANS: 'allergenCrustaceans',
  MOLLUSCS: 'allergenMolluscs',
  SULPHUR_DIOXIDE: 'allergenSulphurDioxide',
};

const CONTAINMENT_KEYS: Record<string, string> = {
  CONTAINS: 'allergenContains',
  MAY_CONTAIN: 'allergenMayContain',
  FREE_FROM: 'allergenFreeFrom',
};

interface AllergenBadge {
  code: string;
  containment: string;
  labelKey: string;
  containmentKey: string;
}

@Component({
  selector: 'app-product',
  standalone: true,
  imports: [CommonModule, RouterLink, StarRatingComponent, JsonLdDrawerComponent],
  templateUrl: './product.html',
  styleUrl: './product.css',
})
export class ProductComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private productService = inject(ProductService);
  private titleService = inject(Title);
  private metaService = inject(Meta);
  private siteOrigin = inject(SiteOriginService);
  private structuredData = inject(StructuredDataService);
  protected t = inject(I18nService).t;

  protected onImageError = onImageError;
  protected discountPercent = discountPercent;
  protected formatEuro = formatEuro;
  protected pricePerKg = pricePerKg;
  protected formatNetContent = formatNetContent;

  // toSignal (non uno snapshot letto una volta): Angular riusa la stessa istanza di
  // ProductComponent quando si naviga da un prodotto a un altro (stessa rotta, parametro
  // diverso), quindi senza reattività sui parametri di rotta la pagina resterebbe quella del
  // prodotto precedente.
  private routeParams = toSignal(this.route.paramMap);
  gtin = computed(() => this.routeParams()?.get('gtin') ?? null);

  activeImageIndex = signal(0);

  product = computed(() => {
    const gtin = this.gtin();
    return gtin ? this.productService.getProductByGtin(gtin) : undefined;
  });

  images = computed<string[]>(() => {
    const prod = this.product();
    return prod ? productImages(prod) : [];
  });

  activeImage = computed(() => this.images()[this.activeImageIndex()] ?? '');

  setActiveImage(index: number): void {
    this.activeImageIndex.set(index);
  }

  private absoluteUrl(url: string): string {
    if (!url || /^https?:\/\//i.test(url)) return url;
    return `${this.siteOrigin.value.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
  }

  /** Sostituisce il placeholder di dominio coniato in products.json con l'origine reale. */
  private resolveOrigin(id: string): string {
    return id.startsWith(PLACEHOLDER_ORIGIN)
      ? this.siteOrigin.value + id.slice(PLACEHOLDER_ORIGIN.length)
      : id;
  }

  // Stessa fonte del sidecar generato a build time da generate-agent-feed.js (§2): qui gira a
  // runtime, quindi risolve image/brand['@id'] con SiteOriginService invece che con SITE_URL.
  jsonLdJson = computed(() => {
    const prod = this.product();
    if (!prod?.rawGs1Data) return null;

    const doc = JSON.parse(JSON.stringify(prod.rawGs1Data));
    if (doc.name) doc.name = prod.name;
    if (doc.description) doc.description = prod.description;
    doc['hasGS1DigitalLink'] = `${this.siteOrigin.value}/01/${prod.gtin}`;
    // @id è l'identificatore del prodotto stesso: deve coincidere con il GS1 Digital Link
    // risolvibile su questo sito, non con il placeholder salvato in products.json (né,
    // tantomeno, con id.gs1.org — non è il nostro dominio, non risolverebbe questo dato).
    doc['@id'] = doc['hasGS1DigitalLink'];
    if (doc.offers) doc.offers['schema:url'] = doc['hasGS1DigitalLink'];
    if (doc.brand?.['@id']) doc.brand['@id'] = this.resolveOrigin(doc.brand['@id']);
    if (typeof doc.image === 'string') doc.image = this.absoluteUrl(doc.image);
    return doc;
  });

  // Controparte leggibile di gs1:hasAllergen — stessa fonte del JSON-LD, non testo separato.
  allergenBadges = computed<AllergenBadge[]>(() => {
    const details = this.product()?.rawGs1Data?.['gs1:hasAllergen'];
    if (!Array.isArray(details)) return [];
    return details
      .map((d: any): AllergenBadge | null => {
        const code = String(d?.['gs1:allergenType']?.['@id'] ?? '').replace('gs1:AllergenTypeCode-', '');
        const containment = String(d?.['gs1:allergenLevelOfContainmentCode']?.['@id'] ?? '').replace('gs1:LevelOfContainmentCode-', '');
        const labelKey = ALLERGEN_CODE_KEYS[code];
        const containmentKey = CONTAINMENT_KEYS[containment];
        return labelKey && containmentKey ? { code, containment, labelKey, containmentKey } : null;
      })
      .filter((b: AllergenBadge | null): b is AllergenBadge => b !== null);
  });

  // Sezioni informative "a fisarmonica" (ispirate a coopshop.it): chiuse di default, si aprono
  // in autonomia una dall'altra. Niente sticky sulla galleria (vedi .gallery in product.css):
  // aprire/chiudere una sezione cambia l'altezza della colonna info, e uno sticky l'avrebbe
  // fatta "risucchiare" in su esattamente come succedeva con le vecchie tab.
  private openSections = signal<ReadonlySet<string>>(new Set());

  isSectionOpen(key: string): boolean {
    return this.openSections().has(key);
  }

  toggleSection(key: string): void {
    const next = new Set(this.openSections());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.openSections.set(next);
  }

  jsonLdDrawerOpen = signal(false);

  openJsonLd(): void {
    this.jsonLdDrawerOpen.set(true);
  }

  closeJsonLd(): void {
    this.jsonLdDrawerOpen.set(false);
  }

  constructor() {
    // Rotta riusata cambiando :gtin (navigazione da un prodotto all'altro): serve un effect,
    // non ngOnInit, altrimenti titolo/meta/JSON-LD resterebbero quelli del prodotto precedente.
    effect(() => {
      const prod = this.product();
      this.activeImageIndex.set(0);
      this.openSections.set(new Set());
      if (!prod) return;
      this.titleService.setTitle(`${prod.name} | ${this.t('hero.pageTitle')}`);
      this.metaService.updateTag({ name: 'description', content: prod.description });
      this.metaService.updateTag({ property: 'og:title', content: prod.name });
      // og:image richiede un URL assoluto per specifica: chi lo consuma (anteprime social,
      // crawler) legge il tag fuori dal contesto della pagina.
      this.metaService.updateTag({ property: 'og:image', content: this.absoluteUrl(prod.image) });
    });

    effect(() => {
      this.structuredData.apply('product-jsonld', this.jsonLdJson());
    });
  }

  ngOnDestroy(): void {
    this.structuredData.remove('product-jsonld');
  }
}
