import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ProductService, productImages, discountPercent, formatEuro, pricePerKg, formatNetContent, formatDimensions, nutritionBasisLabel } from '../../services/product.service';
import { StarRatingComponent } from '../../components/star-rating/star-rating';
import { JsonLdDrawerComponent } from '../../components/json-ld-drawer/json-ld-drawer';
import { IconComponent, IconName } from '../../components/icon/icon';
import { setSocialMeta } from '../../utils/social-meta';
import { normalizeUrl } from '../../utils/url';
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
  WHEAT: 'allergenWheat',
  BARLEY: 'allergenBarley',
  HAZELNUTS: 'allergenHazelnuts',
  LACTOSE: 'allergenLactose',
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

interface NutritionRow {
  labelKey: string;
  value: string;
}

/** Rivendicazione/caratteristica mostrata come badge sotto il titolo — a colpo d'occhio, senza aprire l'accordion. */
interface HighlightBadge {
  icon: IconName;
  label: string;
  tone: 'success' | 'accent' | 'neutral';
}

/** Dato riassuntivo mostrato nella striscia "in breve" — icona + etichetta + valore. */
interface QuickFact {
  icon: IconName;
  label: string;
  value: string;
}

// codice gs1:DietTypeCode-* → icona più espressiva del generico 'award'.
const DIET_ICONS: Record<string, IconName> = {
  VEGAN: 'leaf',
  VEGETARIAN: 'leaf',
  ORGANIC: 'leaf',
  FREE_FROM_GLUTEN: 'alert-triangle',
  COELIAC: 'alert-triangle',
};

@Component({
  selector: 'app-product',
  standalone: true,
  imports: [CommonModule, RouterLink, StarRatingComponent, JsonLdDrawerComponent, IconComponent],
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
  protected formatDimensions = formatDimensions;
  protected nutritionBasisLabel = nutritionBasisLabel;

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

  // Sito ufficiale a cui punta il bottone della purchase-card, in ordine di priorità:
  // 1. officialProductUrl — la scheda di QUESTO prodotto sul sito ufficiale (la più precisa,
  //    fornita per ciascun prodotto);
  // 2. per i prodotti a marchio del distributore (manufacturer.packagedFor valorizzato: il
  //    produttore in etichetta è un terzista, non chi possiede il marchio) l'e-commerce del
  //    distributore, non il sito dello stabilimento che lo confeziona;
  // 3. il sito del produttore/brand (es. sottilette.it);
  // 4. il sito del brand owner (es. conad.it).
  // Mai un link coniato: sempre uno dei siti già presenti nel dato sorgente.
  officialWebsiteUrl = computed(() => {
    const prod = this.product();
    const website =
      prod?.officialProductUrl ||
      prod?.manufacturer?.packagedFor?.website ||
      prod?.manufacturer?.website ||
      prod?.brandOwner?.website;
    return website ? normalizeUrl(website) : null;
  });

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

  // BreadcrumbList — stessa struttura del breadcrumb visibile in product.html, pubblicata anche
  // come dato strutturato (rich result "briciole di pane" nei risultati di ricerca).
  breadcrumbJsonLd = computed(() => {
    const prod = this.product();
    if (!prod) return null;
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: this.t('nav.home'), item: this.siteOrigin.value },
        { '@type': 'ListItem', position: 2, name: prod.name, item: `${this.siteOrigin.value}/01/${prod.gtin}` },
      ],
    };
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

  // Righe della tabella valori nutrizionali, in ordine di etichetta — un unico posto dove
  // decidere quali nutrienti mostrare invece di ripetere lo stesso @if per ognuno nel template.
  nutritionRows = computed<NutritionRow[]>(() => {
    const n = this.product()?.food?.nutrition;
    if (!n) return [];
    const basis = nutritionBasisLabel(n.basis);
    const rows: NutritionRow[] = [];
    if (n.energyKj != null || n.energyKcal != null) {
      const parts: string[] = [];
      if (n.energyKj != null) parts.push(`${n.energyKj} kJ`);
      if (n.energyKcal != null) parts.push(`${n.energyKcal} kcal`);
      rows.push({ labelKey: 'energy', value: `${parts.join(' / ')} ${basis}` });
    }
    const push = (labelKey: string, value: number | undefined, unit: string) => {
      if (value != null) rows.push({ labelKey, value: `${value} ${unit} ${basis}` });
    };
    push('fat', n.fat, 'g');
    push('saturatedFat', n.saturatedFat, 'g');
    push('monounsaturatedFat', n.monounsaturatedFat, 'g');
    push('polyunsaturatedFat', n.polyunsaturatedFat, 'g');
    push('carbohydrates', n.carbohydrates, 'g');
    push('sugars', n.sugars, 'g');
    push('fiber', n.fiber, 'g');
    push('protein', n.protein, 'g');
    push('salt', n.salt, 'g');
    push('calcium', n.calcium, 'mg');
    return rows;
  });

  // Badge "a colpo d'occhio" sotto il titolo (biologico, vegano, senza-allergene, gradazione,
  // prima certificazione): stessa fonte dei dati già mostrati nell'accordion, solo evidenziata
  // prima che l'utente debba aprire una sezione — pattern comune alle schede prodotto alimentari
  // (Coop, Eataly) da cui la UI di questa pagina prende ispirazione.
  highlightBadges = computed<HighlightBadge[]>(() => {
    const prod = this.product();
    if (!prod) return [];
    const badges: HighlightBadge[] = [];

    if (prod.organicClaim) {
      badges.push({ icon: 'leaf', label: this.t('product.organic'), tone: 'success' });
    }
    for (const claim of prod.dietClaims ?? []) {
      if (claim.code === 'ORGANIC' && prod.organicClaim) continue; // già mostrato sopra
      badges.push({ icon: DIET_ICONS[claim.code] ?? 'award', label: claim.label, tone: 'success' });
    }
    for (const d of prod.food?.allergenDeclarations ?? []) {
      if (d.containment !== 'FREE_FROM') continue;
      const labelKey = ALLERGEN_CODE_KEYS[d.code];
      if (!labelKey) continue;
      badges.push({
        icon: 'alert-triangle',
        label: `${this.t('product.allergenFreeFrom')} ${this.t('product.' + labelKey)}`,
        tone: 'success',
      });
    }
    if (prod.alcohol) {
      badges.push({ icon: 'droplet', label: `${prod.alcohol.percentageByVolume}% vol`, tone: 'neutral' });
    }
    if (prod.certifications?.length) {
      const top = prod.certifications[0];
      badges.push({ icon: 'shield-check', label: top.standard || top.agency, tone: 'accent' });
    }
    return badges;
  });

  // Striscia "in breve": 3-4 fatti riassuntivi con icona, leggibili prima ancora di aprire una
  // sezione — l'infografica della pagina prodotto.
  quickFacts = computed<QuickFact[]>(() => {
    const prod = this.product();
    if (!prod) return [];
    const facts: QuickFact[] = [];
    const n = prod.food?.nutrition;
    if (n?.energyKcal != null) {
      facts.push({ icon: 'zap', label: this.t('product.energy'), value: `${n.energyKcal} kcal ${nutritionBasisLabel(n.basis)}` });
    }
    if (prod.storage?.type) {
      facts.push({ icon: 'thermometer', label: this.t('product.storage'), value: prod.storage.type });
    }
    if (prod.countryOfOrigin) {
      facts.push({ icon: 'map-pin', label: this.t('product.origin'), value: prod.countryOfOrigin });
    }
    if (prod.packaging?.type) {
      facts.push({ icon: 'box', label: this.t('product.format'), value: prod.packaging.type });
    }
    return facts;
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
      // og:image/og:url richiedono un URL assoluto per specifica: chi li consuma (anteprime
      // social, crawler) legge il tag fuori dal contesto della pagina.
      setSocialMeta(this.metaService, {
        title: prod.name,
        description: prod.description,
        url: `${this.siteOrigin.value}/01/${prod.gtin}`,
        image: this.absoluteUrl(prod.image),
      });
    });

    effect(() => {
      this.structuredData.apply('product-jsonld', this.jsonLdJson());
    });

    effect(() => {
      this.structuredData.apply('product-breadcrumb-jsonld', this.breadcrumbJsonLd());
    });
  }

  ngOnDestroy(): void {
    this.structuredData.remove('product-jsonld');
    this.structuredData.remove('product-breadcrumb-jsonld');
  }
}
