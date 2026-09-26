import { Component, OnDestroy, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { QRCodeComponent } from 'angularx-qrcode';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, Meta, SafeHtml, Title } from '@angular/platform-browser';
import { ProductService, productImages, discountPercent, formatEuro, pricePerKg, formatNetContent, formatDimensions, nutritionBasisLabel } from '../../services/product.service';
import { StarRatingComponent } from '../../components/star-rating/star-rating';
import { JsonLdDrawerComponent } from '../../components/json-ld-drawer/json-ld-drawer';
import { IconComponent, IconName } from '../../components/icon/icon';
import { highlightJson } from '../../utils/json-highlight';
import { setSocialMeta } from '../../utils/social-meta';
import { normalizeUrl } from '../../utils/url';
import { onImageError } from '../../utils/image-fallback';
import { I18nService } from '../../services/i18n.service';
import { LanguageService } from '../../services/language.service';
import { ResolverOriginService } from '../../services/resolver-origin.service';
import { SiteOriginService, SSR_FALLBACK_ORIGIN } from '../../services/site-origin.service';
import { StructuredDataService } from '../../services/structured-data.service';
import { DppRecord, RegistryApiService } from '../../services/registry-api.service';
import { ScrollRevealDirective } from '../../directives/scroll-reveal';
import { SECTORS, localizeSector } from '../../data/sectors';
import { AttributeLinkTypeId, DPP_LINK_TYPES, classifyAttribute } from '../../data/dpp-link-types';
import { LinkTypeHeadComponent } from '../../components/link-type-head/link-type-head';
import { DEMO_ECONOMIC_OPERATOR_ID, DEMO_FACILITY_ID, DPP_SCHEMA_VERSION, toStandardDppStatus, toStandardGranularity } from '../../utils/dpp-jsonld';

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

/** Una riga "Contiene: X, Y, Z" / "Può contenere: A, B" — nomi già uniti in una frase, non un
 * pillola per allergene che ripete la parola "Contiene" N volte. */
interface AllergenGroup {
  containmentKey: string;
  names: string;
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
  imports: [CommonModule, RouterLink, QRCodeComponent, StarRatingComponent, JsonLdDrawerComponent, IconComponent, ScrollRevealDirective, LinkTypeHeadComponent],
  templateUrl: './product.html',
  styleUrl: './product.css',
})
export class ProductComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private productService = inject(ProductService);
  private titleService = inject(Title);
  private metaService = inject(Meta);
  private siteOrigin = inject(SiteOriginService);
  private resolverOrigin = inject(ResolverOriginService);
  private structuredData = inject(StructuredDataService);
  private registryApi = inject(RegistryApiService);
  private languageService = inject(LanguageService);
  private platformId = inject(PLATFORM_ID);
  private document = inject(DOCUMENT);
  private sanitizer = inject(DomSanitizer);
  /** angularx-qrcode manipola il DOM: niente rendering lato server (stesso motivo della home). */
  protected isBrowser = isPlatformBrowser(this.platformId);
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

  // Scheda DPP creata/pubblicata da /admin per questo GTIN — recuperata solo quando il
  // catalogo statico (products.json) non ha nulla per questo GTIN, vedi l'effect nel
  // costruttore. `registry-api` è la sola fonte per questi GTIN: non fanno parte del build
  // (products.json), quindi la pagina è sempre client-side per loro (vedi il commento su
  // `/01/` in webshop/nginx.conf).
  dppRecord = signal<DppRecord | null>(null);
  dppLoading = signal(false);

  dppSector = computed(() => {
    const record = this.dppRecord();
    if (!record) return null;
    const base = SECTORS.find((s) => s.id === record.sectorId) ?? SECTORS[0];
    return localizeSector(base, this.languageService.lang());
  });

  dppAttributeEntries = computed(() => Object.entries(this.dppRecord()?.attributes ?? {}));
  protected economicOperatorId = computed(() => this.dppRecord()?.economicOperatorId || DEMO_ECONOMIC_OPERATOR_ID);
  protected facilityId = computed(() => this.dppRecord()?.facilityId || DEMO_FACILITY_ID);

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

  /** JSON-LD di una scheda DPP pubblicata — stessa logica di registry-api/src/jsonld.ts
   * (due servizi, stesso contratto tenuto a mano, come DppRecord). Ogni termine gs1: è
   * verificato contro il vocabolario ufficiale, vedi il commento lì per il dettaglio. */
  /** UPI: stesso URI GS1 Digital Link registrato come "upi" presso il DPP Registry UE (vedi
   * mockRegistryClient.ts#buildUpi) — al livello di granularità più fine dichiarato dalla
   * scheda, quindi con l'AI (10)/(21) in coda quando presente. Alimenta sia il JSON-LD sia il QR
   * code mostrato nella pagina del passaporto. */
  protected dppUpi = computed(() => {
    const dpp = this.dppRecord();
    if (!dpp) return '';
    const id = `${this.siteOrigin.value}/01/${dpp.gtin}`;
    if (dpp.granularityLevel === 'MODEL' || !dpp.batchOrSerial) return id;
    const value = dpp.batchOrSerial.replace(/^\(\d{2}\)\s*/, '').trim();
    const ai = /^\(21\)/.test(dpp.batchOrSerial) || dpp.granularityLevel === 'ITEM' ? '21' : '10';
    return `${id}/${ai}/${encodeURIComponent(value)}`;
  });

  protected granularityLevels = ['MODEL', 'BATCH', 'ITEM'] as const;

  /** Lotto o seriale già "ripulito" dal prefisso AI, con il tipo dedotto (stessa regola di
   * dppUpi): serve alla casella identificativi della pagina passaporto. */
  protected dppBatchOrSerial = computed(() => {
    const dpp = this.dppRecord();
    if (!dpp?.batchOrSerial) return null;
    const value = dpp.batchOrSerial.replace(/^\(\d{2}\)\s*/, '').trim();
    const isSerial = /^\(21\)/.test(dpp.batchOrSerial) || dpp.granularityLevel === 'ITEM';
    return { value, isSerial };
  });

  /** DPP-ID come URN UUID — lo stesso valore di digitalProductPassportId nel JSON-LD. */
  protected dppUrn = computed(() => {
    const dpp = this.dppRecord();
    return dpp ? `urn:uuid:${dpp.id}` : '';
  });

  /** Estrae un GLN (13 cifre) in coda a un identificativo GS1 (URI Digital Link, URN…), se c'è. */
  protected glnOf(id: string): string | null {
    const match = /(\d{13})\/?$/.exec(id ?? '');
    return match ? match[1] : null;
  }

  protected copiedKey = signal<string | null>(null);

  protected async copy(key: string, text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedKey.set(key);
      setTimeout(() => this.copiedKey.set(null), 1800);
    } catch {
      /* clipboard non disponibile — ignora */
    }
  }

  /** Attributi della scheda raggruppati per link type del GS1 Web Vocabulary che li descrive
   * (vedi classifyAttribute) — ogni gruppo è una sezione della pagina e un link sul resolver. */
  protected attributeGroups = computed(() => {
    const groups: Record<AttributeLinkTypeId, [string, string][]> = {
      sustainabilityInfo: [],
      certificationInfo: [],
      safetyInfo: [],
      instructions: [],
      masterData: [],
    };
    for (const entry of this.dppAttributeEntries()) groups[classifyAttribute(entry[0])].push(entry);
    return groups;
  });

  /** Host del resolver mostrato nel navigatore delle sezioni. */
  protected resolverHost = this.resolverOrigin.value.replace(/^https?:\/\//, '');

  /** Sezioni realmente presenti in questa scheda, nell'ordine della pagina: quelle strutturali
   * (dpp, pip, masterData, traceability) sempre, le altre solo se c'è almeno un dato. */
  protected sectionNav = computed(() => {
    const dpp = this.dppRecord();
    if (!dpp) return [];
    const groups = this.attributeGroups();
    const present = (id: string): boolean => {
      switch (id) {
        case 'sustainabilityInfo':
        case 'certificationInfo':
        case 'safetyInfo':
        case 'instructions':
          return groups[id].length > 0;
        case 'registryEntry':
          return !!dpp.registryId;
        default:
          return true;
      }
    };
    return DPP_LINK_TYPES.filter((lt) => present(lt.id)).map((lt) => ({ lt }));
  });

  protected registeredAtLabel = computed(() => {
    const at = this.dppRecord()?.registeredAt;
    if (!at) return '';
    return new Date(at).toLocaleString(this.languageService.lang() === 'it' ? 'it-IT' : 'en-GB', { dateStyle: 'long', timeStyle: 'short' });
  });

  /** Attributo di impronta di carbonio, se la scheda ne ha uno (chiave che contiene "carbonio"
   * o "CO₂"): valore in evidenza e unità dalla parentesi della chiave. Nessun valore inventato —
   * solo ciò che l'operatore ha dichiarato. Cercato solo fra gli attributi di sostenibilità. */
  protected dppCarbon = computed(() => {
    const entry = this.attributeGroups().sustainabilityInfo.find(([key]) => /carbon|co₂|co2/i.test(key));
    if (!entry) return null;
    const unit = /\(([^)]+)\)/.exec(entry[0])?.[1] ?? '';
    return { label: entry[0].replace(/\s*\([^)]*\)\s*$/, ''), value: entry[1], unit };
  });

  /** Attributi di sostenibilità espressi in percentuale ("… (%)") come barre — solo valori
   * numerici veri. */
  protected dppPercents = computed(() =>
    this.attributeGroups()
      .sustainabilityInfo.filter(([key]) => /\(%\)/.test(key))
      .map(([key, value]) => ({ label: key.replace(/\s*\(%\)\s*$/, ''), value: Number.parseFloat(String(value).replace(',', '.')) }))
      .filter((row) => Number.isFinite(row.value))
      .map((row) => ({ ...row, value: Math.max(0, Math.min(100, row.value)) }))
  );

  /** Il resto degli attributi di sostenibilità: quelli non già mostrati come indicatore/barra. */
  protected sustainabilityRest = computed(() =>
    this.attributeGroups().sustainabilityInfo.filter(([key]) => !/carbon|co₂|co2/i.test(key) && !/\(%\)/.test(key))
  );

  /** Eventi mostrati nella cronologia: solo quelli davvero registrati (creazione, registrazione
   * sul registro, eventuale modifica successiva) più un segnaposto esplicito per il fine vita. */
  protected dppEvents = computed(() => {
    const dpp = this.dppRecord();
    if (!dpp) return [];
    const locale = this.languageService.lang() === 'it' ? 'it-IT' : 'en-GB';
    const fmt = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' });
    const events: { key: string; title: string; text: string; when: string; meta?: string; future?: boolean }[] = [
      { key: 'created', title: this.t('product.eventCreated'), text: this.t('product.eventCreatedText'), when: fmt(dpp.createdAt), meta: this.dppUrn() },
    ];
    if (dpp.registeredAt) {
      events.push({
        key: 'registered',
        title: this.t('product.eventRegistered'),
        text: this.t('product.eventRegisteredText'),
        when: fmt(dpp.registeredAt),
        meta: dpp.registryId ? `${this.t('product.eventRegistryId')}: ${dpp.registryId}` : undefined,
      });
    }
    const baseline = new Date(dpp.registeredAt ?? dpp.createdAt).getTime();
    if (new Date(dpp.updatedAt).getTime() - baseline > 60_000) {
      events.push({ key: 'updated', title: this.t('product.eventUpdated'), text: this.t('product.eventUpdatedText'), when: fmt(dpp.updatedAt) });
    }
    events.push({ key: 'eol', title: this.t('product.eventEndOfLife'), text: this.t('product.eventEndOfLifeText'), when: '', future: true });
    return events;
  });

  protected jsonLdText = computed(() => {
    const doc = this.activeJsonLd();
    return doc ? JSON.stringify(doc, null, 2) : '';
  });
  protected jsonLdBytes = computed(() => new TextEncoder().encode(this.jsonLdText()).length);
  protected jsonLdHtml = computed<SafeHtml>(() => this.sanitizer.bypassSecurityTrustHtml(highlightJson(this.jsonLdText())));

  /** SHA-256 calcolato davvero (Web Crypto) sul testo del JSON-LD mostrato qui sopra — non il
   * hash che mock-eu-registry calcola sulla pagina HTML (vedi mockRegistryClient.ts): etichettato
   * di conseguenza nel template. Solo lato browser. */
  protected jsonLdHash = signal('');

  protected downloadJsonLd(): void {
    const blob = new Blob([this.jsonLdText()], { type: 'application/ld+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dpp-${this.dppRecord()?.gtin ?? 'passport'}.jsonld`;
    a.click();
    URL.revokeObjectURL(url);
  }

  dppJsonLdJson = computed(() => {
    const dpp = this.dppRecord();
    if (!dpp) return null;

    const id = `${this.siteOrigin.value}/01/${dpp.gtin}`;
    const upi = this.dppUpi();

    const doc: Record<string, unknown> = {
      // "@vocab" copre le chiavi senza prefisso (name, i campi del nucleo) — vedi il commento
      // nello stesso punto di registry-api/src/jsonld.ts#dppToJsonLd per il dettaglio.
      '@context': {
        gs1: 'https://ref.gs1.org/voc/',
        schema: 'https://schema.org/',
        '@vocab': 'https://schema.org/',
      },
      '@type': ['Product', 'gs1:Product'],
      '@id': id,
      digitalProductPassportId: `urn:uuid:${dpp.id}`,
      uniqueProductIdentifier: upi,
      name: dpp.name,
      'gs1:gtin': dpp.gtin,
      granularity: toStandardGranularity(dpp.granularityLevel),
      dppSchemaVersion: DPP_SCHEMA_VERSION,
      dppStatus: toStandardDppStatus(dpp.status),
      lastUpdate: dpp.updatedAt,
      // Valori reali del record (compilati dall'utente nel form admin), non più le costanti
      // demo fisse: erano rimaste qui da prima che economicOperatorId/facilityId diventassero
      // campi compilabili per-scheda (vedi db.ts) — bug, non una scelta voluta: due schede
      // diverse possono avere un GLN diverso, e questa era l'unica JSON-LD del progetto a non
      // rifletterlo ancora.
      economicOperatorId: dpp.economicOperatorId || DEMO_ECONOMIC_OPERATOR_ID,
      facilityId: dpp.facilityId || DEMO_FACILITY_ID,
      // dppSector() ricade sempre su un settore valido (vedi il computed poco sopra) quando
      // dppRecord() è valorizzato, come lo è qui: mai vuoto in pratica.
      contentSpecificationIds: this.dppSector() ? [this.dppSector()!.contentSpecificationId] : [],
    };

    if (dpp.batchOrSerial) {
      const value = dpp.batchOrSerial.replace(/^\(\d{2}\)\s*/, '').trim();
      if (/^\(21\)/.test(dpp.batchOrSerial) || dpp.granularityLevel === 'ITEM') {
        doc['gs1:hasSerialNumber'] = value;
      } else {
        doc['gs1:hasBatchLotNumber'] = value;
      }
    }

    // Ogni attributo come chiave di primo livello, non più avvolti in
    // schema:additionalProperty/PropertyValue — vedi jsonld.ts#dppToJsonLd. Stessa guardia
    // anti-collisione degli altri due costruttori di questo stesso documento.
    for (const [propName, value] of Object.entries(dpp.attributes)) {
      if (propName in doc) continue;
      doc[propName] = value;
    }

    // Il DPP Registry UE restituisce "registrationId", non "registryId" (nome solo nostro,
    // interno).
    if (dpp.registryId) doc['registrationId'] = dpp.registryId;

    return doc;
  });

  /** Il documento JSON-LD davvero attivo nel drawer, quale che sia il ramo in vista (prodotto
   * statico o scheda DPP) — un solo drawer condiviso invece di due istanze duplicate. */
  activeJsonLd = computed(() => this.jsonLdJson() ?? this.dppJsonLdJson());

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
  // Il JSON-LD dichiara sempre tutti i 14 allergeni UE (anche i FREE_FROM, per completezza
  // machine-readable — vedi buildAllergens() nello script che popola rawGs1Data), ma qui si
  // mostrano solo CONTAINS/MAY_CONTAIN: un'etichetta reale non elenca mai gli allergeni assenti,
  // solo quelli presenti o possibili — un badge "Senza X" per ognuno dei 14 sarebbe rumore, non
  // informazione.
  allergenBadges = computed<AllergenBadge[]>(() => {
    const details = this.product()?.rawGs1Data?.['gs1:hasAllergen'];
    if (!Array.isArray(details)) return [];
    return details
      .map((d: any): AllergenBadge | null => {
        const code = String(d?.['gs1:allergenType']?.['@id'] ?? '').replace('gs1:AllergenTypeCode-', '');
        const containment = String(d?.['gs1:allergenLevelOfContainmentCode']?.['@id'] ?? '').replace('gs1:LevelOfContainmentCode-', '');
        if (containment === 'FREE_FROM') return null;
        const labelKey = ALLERGEN_CODE_KEYS[code];
        const containmentKey = CONTAINMENT_KEYS[containment];
        return labelKey && containmentKey ? { code, containment, labelKey, containmentKey } : null;
      })
      .filter((b: AllergenBadge | null): b is AllergenBadge => b !== null);
  });

  // "Contiene: Grano, Glutine, Uova, Latte." invece di quattro pillole che ripetono ognuna la
  // parola "Contiene" — più vicino a come si legge davvero un'etichetta.
  allergenGroups = computed<AllergenGroup[]>(() => {
    const badges = this.allergenBadges();
    const order = ['CONTAINS', 'MAY_CONTAIN'];
    return order
      .map((containment) => ({
        containmentKey: CONTAINMENT_KEYS[containment],
        names: badges
          .filter((b) => b.containment === containment)
          .map((b) => this.t('product.' + b.labelKey))
          .join(', '),
      }))
      .filter((group) => group.names.length > 0);
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

    // Fetch della scheda DPP: solo lato browser (registry-api non esiste durante `ng build` /
    // il prerender, vedi stesso pattern in home.ts per il QR code) e solo quando il GTIN non è
    // nel catalogo statico — un GTIN presente in products.json non tocca mai registry-api.
    if (isPlatformBrowser(this.platformId)) {
      effect(() => {
        const gtin = this.gtin();
        const staticProduct = this.product();
        this.dppRecord.set(null);
        if (!gtin || staticProduct) {
          this.dppLoading.set(false);
          return;
        }
        this.dppLoading.set(true);
        this.registryApi.getPublicByGtin(gtin).subscribe({
          next: (record) => {
            this.dppLoading.set(false);
            this.dppRecord.set(record);
            this.scrollToFragment();
          },
          error: () => {
            this.dppLoading.set(false);
          },
        });
      });
    }

    if (isPlatformBrowser(this.platformId)) {
      effect(() => {
        const text = this.jsonLdText();
        if (!text) {
          this.jsonLdHash.set('');
          return;
        }
        void crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then((buf) => {
          this.jsonLdHash.set([...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''));
        });
      });
    }

    effect(() => {
      const dpp = this.dppRecord();
      if (!dpp) return;
      const sector = this.dppSector();
      this.titleService.setTitle(`${dpp.name} | ${this.t('hero.pageTitle')}`);
      this.metaService.updateTag({ name: 'description', content: sector?.description ?? dpp.name });
      setSocialMeta(this.metaService, {
        title: dpp.name,
        description: sector?.description ?? dpp.name,
        url: `${this.siteOrigin.value}/01/${dpp.gtin}`,
      });
    });
  }

  /** Un link dal resolver come `/01/{gtin}#section-sustainabilityInfo` arriva prima che i dati
   * della scheda siano caricati: l'anchorScrolling del router scatta a pagina ancora vuota, quindi
   * si riprova qui, a sezioni renderizzate. */
  private scrollToFragment(): void {
    // Il resolver accoda `?linkType=…` a qualunque destinazione, anche dopo il frammento
    // ("#section-x?linkType=gs1%3Ax"): l'id della sezione è la parte prima del "?".
    const id = this.document.location.hash.replace(/^#/, '').split('?')[0];
    if (!id) return;
    setTimeout(() => this.document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  ngOnDestroy(): void {
    this.structuredData.remove('product-jsonld');
    this.structuredData.remove('product-breadcrumb-jsonld');
  }
}
