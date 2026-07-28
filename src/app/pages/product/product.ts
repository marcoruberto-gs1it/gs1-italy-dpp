import { Component, computed, effect, inject, OnDestroy, OnInit, signal, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser, DOCUMENT } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, Meta, SafeHtml, Title } from '@angular/platform-browser';
import { QRCodeComponent } from 'angularx-qrcode';
import { ProductService, TraceEvent, EdiMessage, EDI_DEMO_BUYER, isAiReady, isVerified, productImages, getVocabularies, buildEpcisEvent, buildEdiFlow, buildGdsnWebVocabJson, discountPercent, formatEuro } from '../../services/product.service';
import { UiStateService } from '../../services/ui-state.service';
import { StarRatingComponent } from '../../components/star-rating/star-rating';
import { DigitalLinkVisualizerComponent } from '../../components/digital-link-visualizer/digital-link-visualizer';
import { DataMatrixComponent } from '../../components/data-matrix/data-matrix';
import { IconComponent, IconName } from '../../components/icon/icon';
import { onImageError } from '../../utils/image-fallback';
import { highlightJson } from '../../utils/json-highlight';
import { downloadBarcodePng, downloadBarcodeSvg } from '../../utils/barcode-download';
import { I18nService } from '../../services/i18n.service';
import { SiteOriginService } from '../../services/site-origin.service';

type ProductTab = 'details' | 'sustainability' | 'supply-chain' | 'gdsn' | 'edi' | 'structured-data';

// Chiavi = valori reali del code list CBV BizStep (https://ref.gs1.org/cbv/), usati anche
// come stringa "bizStep" negli eventi EPCIS di esempio (vedi buildEpcisEvent).
const BIZ_STEP_ICONS: Record<string, IconName> = {
  commissioning: 'map-pin',
  assembling: 'building',
  shipping: 'truck',
  inspecting: 'check-circle',
  retail_selling: 'flag',
  decommissioning: 'refresh',
  repairing: 'wrench',
};

// Un'icona per ciascuno dei cinque messaggi del ciclo Order-to-Cash GS1 EDI (vedi buildEdiFlow).
const EDI_STEP_ICONS: Record<EdiMessage['code'], IconName> = {
  ORDERS: 'send',
  ORDRSP: 'check-circle',
  DESADV: 'truck',
  RECADV: 'inbox',
  INVOIC: 'file-text',
};

@Component({
  selector: 'app-product',
  standalone: true,
  imports: [CommonModule, RouterModule, QRCodeComponent, StarRatingComponent, DigitalLinkVisualizerComponent, DataMatrixComponent, IconComponent],
  templateUrl: './product.html',
  styleUrl: './product.css',
})
export class ProductComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private productService = inject(ProductService);
  protected uiState = inject(UiStateService);
  protected t = inject(I18nService).t;

  private sanitizer = inject(DomSanitizer);
  private metaService = inject(Meta);
  private titleService = inject(Title);

  private platformId = inject(PLATFORM_ID);
  private siteOrigin = inject(SiteOriginService);
  private document = inject(DOCUMENT);

  isBrowser = signal<boolean>(false);

  // toSignal (non uno snapshot letto una volta in ngOnInit): Angular riusa la stessa istanza di
  // ProductComponent quando si naviga da un prodotto a un altro (stessa rotta, parametro
  // diverso — es. da un link "prodotti correlati"), quindi ngOnInit non viene richiamato. Senza
  // reattività sui parametri di rotta l'intera pagina (titolo, meta tag, JSON-LD, galleria...)
  // resterebbe quella del prodotto precedente fino a un refresh completo.
  private routeParams = toSignal(this.route.paramMap);
  private routeQueryParams = toSignal(this.route.queryParamMap);

  gtin = computed(() => this.routeParams()?.get('gtin') ?? null);
  lot = computed(() => this.routeParams()?.get('lot') ?? null);
  serial = computed(() => this.routeParams()?.get('serial') ?? null);
  expiration = computed(() => this.routeQueryParams()?.get('17') ?? null);

  activeTab = signal<ProductTab>('details');
  activeImageIndex = signal(0);
  lightboxOpen = signal(false);
  expandedEvent = signal<number | null>(null);
  showLotSerialExample = signal(false);

  protected isAiReady = isAiReady;
  protected isVerified = isVerified;
  protected onImageError = onImageError;
  protected discountPercent = discountPercent;
  protected formatEuro = formatEuro;
  protected downloadBarcodePng = downloadBarcodePng;
  protected downloadBarcodeSvg = downloadBarcodeSvg;

  // Sanità: i dispositivi medici pubblicano un UDI (Unique Device Identification), il cui
  // Device Identifier (UDI-DI) coincide col GTIN — GS1 è una delle agenzie di emissione
  // accreditate FDA/EU MDR insieme a HIBCC e ICCBBA. Il GS1 DataMatrix è il data carrier
  // raccomandato per etichette di piccole dimensioni tipiche del settore.
  isHealthcare = computed(() => this.product()?.sectorId === 'healthcare');

  showGdsnExample = signal(false);
  showSsccExample = signal(false);

  toggleGdsnExample(): void {
    this.showGdsnExample.update((v) => !v);
  }

  toggleSsccExample(): void {
    this.showSsccExample.update((v) => !v);
  }

  vocabLabel = computed(() => {
    const vocabs = this.vocabularies();
    const hasGs1 = vocabs.includes('gs1');
    const hasSchema = vocabs.includes('schema');
    return `${hasGs1 ? 'GS1 Web Vocabulary' : ''}${hasGs1 && hasSchema ? ' + ' : ''}${hasSchema ? 'schema.org' : ''}`;
  });

  vocabularies = computed(() => {
    const prod = this.product();
    return prod ? getVocabularies(prod) : [];
  });

  product = computed(() => {
    const currentGtin = this.gtin();
    return currentGtin ? this.productService.getProductByGtin(currentGtin) : undefined;
  });

  images = computed<string[]>(() => {
    const prod = this.product();
    return prod ? productImages(prod) : [];
  });

  activeImage = computed(() => this.images()[this.activeImageIndex()] ?? '');

  // La tab Dettagli è sempre visibile ed è il default della pagina (come su qualunque
  // e-commerce): questo flag serve solo a decidere se mostrare le specifiche vere e proprie o
  // un messaggio di fallback, per il singolo prodotto (attualmente solo le mascherine
  // chirurgiche) senza logistics/food/apparel.
  hasDetailsTab = computed(() => {
    const prod = this.product();
    return !!(prod?.logistics || prod?.food || prod?.apparel);
  });

  hasSustainabilityTab = computed(() => {
    const prod = this.product();
    return !!(prod?.certifications?.length || this.sustainabilityLinks().length || prod?.environmentalImpact);
  });

  packaging = computed(() => this.product()?.rawGs1Data?.['gs1:packaging'] ?? []);
  countryOfOrigin = computed(() => this.product()?.rawGs1Data?.['gs1:countryOfOrigin'] ?? []);

  sustainabilityLinks = computed(() =>
    (this.product()?.links ?? []).filter((l) => l.linkType.includes('sustainability'))
  );

  supplyChainLinks = computed(() =>
    (this.product()?.links ?? []).filter((l) => l.linkType.includes('trace') || l.linkType.includes('Retailer') || l.linkType.includes('retailer'))
  );

  otherLinks = computed(() => {
    const sustain = new Set(this.sustainabilityLinks());
    const supply = new Set(this.supplyChainLinks());
    return (this.product()?.links ?? []).filter((l) => !sustain.has(l) && !supply.has(l));
  });

  hasSupplyChainData = computed(
    () =>
      this.packaging().length > 0 ||
      this.countryOfOrigin().length > 0 ||
      this.supplyChainLinks().length > 0 ||
      !!this.product()?.logistics?.storage ||
      !!this.product()?.economicOperator ||
      !!this.product()?.traceability?.length
  );

  // Tab GDSN: solo per i prodotti che pubblicano dati in GS1 Web Vocabulary e hanno una
  // gerarchia di imballo (unità base / logistiche) di esempio.
  hasGdsnTab = computed(() => this.vocabularies().includes('gs1') && !!this.product()?.gdsn);

  gdsnJson = computed<SafeHtml>(() => {
    const gdsn = this.product()?.gdsn;
    if (!gdsn) return this.sanitizer.bypassSecurityTrustHtml('');
    const json = JSON.stringify(buildGdsnWebVocabJson(gdsn), null, 2);
    return this.sanitizer.bypassSecurityTrustHtml(highlightJson(json));
  });

  // Unità logistiche (cartone, pallet...) della gerarchia GDSN identificate anche da SSCC:
  // stesso principio "classe vs istanza" del lotto/seriale, applicato alla logistica.
  gdsnLogisticsUnits = computed(() =>
    (this.product()?.gdsn?.hierarchy ?? []).filter((item) => item.isDespatchUnit && item.sscc)
  );

  // Digital Link dell'unità logistica: /00/{sscc}, illustrativo (non instrada verso una pagina
  // prodotto reale, dato che ogni SSCC identifica una singola spedizione, non un catalogo).
  ssccDigitalLink(sscc: string): string {
    return `${this.siteOrigin.value}/00/${sscc}`;
  }

  // Tab GS1 EDI: stesso set di prodotti della tab GDSN (18/63), quelli con una gerarchia di
  // imballo completa — è lì che il collegamento DESADV → SSCC → Digital Link (vedi ediFlow e
  // ssccDigitalLink) ha davvero senso da mostrare, oltre a richiedere comunque un
  // economicOperator (il "venditore" del ciclo Order-to-Cash).
  hasEdiTab = computed(() => this.hasGdsnTab() && !!this.product()?.economicOperator);

  ediFlow = computed<EdiMessage[]>(() => {
    const prod = this.product();
    return prod ? buildEdiFlow(prod) : [];
  });

  expandedEdiMessage = signal<number | null>(null);

  toggleEdiMessage(index: number): void {
    this.expandedEdiMessage.update((current) => (current === index ? null : index));
  }

  ediStepIcon(code: EdiMessage['code']): IconName {
    return EDI_STEP_ICONS[code];
  }

  protected ediBuyer = EDI_DEMO_BUYER;

  // Un unico esempio in sintassi GS1 XML (l'alternativa "moderna" a EANCOM per lo stesso
  // messaggio ORDERS) per mostrare che i due sono sintassi diverse per lo stesso contenuto —
  // struttura verificata sulla presentazione ufficiale GS1 "GS1 eCom Standard (EDI) and its
  // Benefits". Testo semplice (non JSON): niente highlightJson, che è specifico per JSON.
  ediXmlExample = computed<string>(() => {
    const prod = this.product();
    const seller = prod?.economicOperator;
    if (!prod || !seller) return '';
    const flow = this.ediFlow();
    const orders = flow.find((m) => m.code === 'ORDERS');
    const orderNum = `PO-${prod.gtin.slice(-6)}`;
    const created = orders ? orders.date : new Date().toISOString();
    return `<order:order creationDateTime="${created}" documentStatus="ORIGINAL">
  <orderIdentification>
    <uniqueCreatorIdentification>${orderNum}</uniqueCreatorIdentification>
    <contentOwner>
      <gln>${this.ediBuyer.gln}</gln>
    </contentOwner>
  </orderIdentification>
  <orderPartyInformation>
    <seller>
      <gln>${seller.gln}</gln>
    </seller>
    <buyer>
      <gln>${this.ediBuyer.gln}</gln>
    </buyer>
  </orderPartyInformation>
  <orderLineItem>
    <lineItemNumber>1</lineItemNumber>
    <tradeItemIdentification>
      <gtin>${prod.gtin}</gtin>
    </tradeItemIdentification>
    <orderedQuantity unitOfMeasure="EA">48</orderedQuantity>
  </orderLineItem>
</order:order>`;
  });

  private readonly traceColors = ['var(--gs1-blue)', 'var(--gs1-teal)', 'var(--gs1-orange)', 'var(--gs1-forest)', 'var(--gs1-honey)'];

  traceDotColor(index: number): string {
    return this.traceColors[index % this.traceColors.length];
  }

  bizStepIcon(bizStep: string): IconName {
    return BIZ_STEP_ICONS[bizStep] ?? 'map-pin';
  }

  toggleEvent(index: number): void {
    this.expandedEvent.update((current) => (current === index ? null : index));
  }

  toggleLotSerialExample(): void {
    this.showLotSerialExample.update((v) => !v);
  }

  // Digital Link esteso con lotto (AI 10) e numero seriale (AI 21): identifica un'istanza
  // specifica del prodotto, a cui sono legati gli eventi EPCIS di filiera.
  exampleDigitalLink = computed<string>(() => {
    const ex = this.product()?.traceabilityExample;
    const base = this.gs1DigitalLink();
    return ex ? `${base}/10/${ex.lot}/21/${ex.serial}` : base;
  });

  epcisJson(event: TraceEvent, index: number): SafeHtml {
    const prod = this.product();
    const instance = prod?.traceabilityExample;
    if (!prod || !instance) return this.sanitizer.bypassSecurityTrustHtml('');
    const json = JSON.stringify(buildEpcisEvent(prod, event, index, instance), null, 2);
    return this.sanitizer.bypassSecurityTrustHtml(highlightJson(json));
  }

  // Cattura l'indirizzo web corrente dinamicamente senza rompere l'architettura SSG
  gs1DigitalLink = computed<string>(() => {
    const currentGtin = this.gtin();
    if (!currentGtin) return '';
    return `${this.siteOrigin.value}/01/${currentGtin}`;
  });

  // Digital Link della pagina effettivamente visitata: riflette lotto/seriale/scadenza se
  // presenti nell'URL corrente (es. da scansione QR), altrimenti coincide col GTIN "nudo".
  currentDigitalLink = computed<string>(() => {
    let url = this.gs1DigitalLink();
    if (!url) return url;
    if (this.lot()) url += `/10/${this.lot()}`;
    if (this.serial()) url += `/21/${this.serial()}`;
    if (this.expiration()) url += `?17=${this.expiration()}`;
    return url;
  });

  // Generazione del JSON-LD conforme al GS1 Web Vocabulary, pubblicato tramite applyJsonLd()
  // (vedi il costruttore): restituisce solo la stringa JSON, non più il tag <script> completo —
  // vedi il commento su applyJsonLd per il perché.
  jsonLdJson = computed<string | null>(() => {
    const prod = this.product();
    // I prodotti demo senza rawGs1Data rappresentano volutamente il caso "non ancora AI Ready"
    // (vedi isAiReady() e il checklist item "jsonLdPresent" in product.html): non devono
    // pubblicare alcun dato strutturato, nemmeno un fallback sintetico — altrimenti ogni
    // prodotto risulterebbe comunque "letto" da un validator schema.org, contraddicendo sia la
    // UI che il senso stesso della demo (mostrare la differenza tra chi pubblica GS1 Web
    // Vocabulary/schema.org e chi no).
    if (!prod || !prod.rawGs1Data) return null;

    // Clonato per non mutare l'originale condiviso da tutte le istanze del componente.
    let jsonLdData: any = JSON.parse(JSON.stringify(prod.rawGs1Data));

    // I campi schema.org semplici (non language-tagged array come le proprietà gs1:) seguono
    // la lingua attiva della UI — a differenza degli array `{ "@value", "@language" }` di
    // gs1:productName/ingredientStatement/ecc., già strutturati in origine con entrambe le
    // lingue e quindi lasciati intatti qui.
    if (jsonLdData.name) jsonLdData.name = prod.name;
    if (jsonLdData.description) jsonLdData.description = prod.description;

    // Le iniezioni seguenti riguardano solo il payload nello "shape" GS1 (gs1:Offer > itemOffered).
    // I prodotti demo che pubblicano solo schema.org (o un mix) hanno una struttura diversa e
    // vengono pubblicati così come sono, senza queste arricchimenti specifici GS1.
    if (jsonLdData.itemOffered) {
      // Iniezione rigorosa dell'immagine strutturata (Standard GS1)
      if (prod.image) {
        jsonLdData.itemOffered.image = {
          "@type": "gs1:ReferencedFileDetails",
          "filePixelWidth": {
            "@value": "300",
            "@type": "xsd:integer"
          },
          "filePixelHeight": {
            "@value": "300",
            "@type": "xsd:integer"
          },
          "referencedFileURL": {
            "@id": prod.image
          }
        };
      }

      // Iniezione dinamica dei dati variabili (Lotto e Scadenza)
      if (!jsonLdData.itemOffered.additionalProperty) {
        jsonLdData.itemOffered.additionalProperty = [];
      }

      if (this.lot()) {
        jsonLdData.itemOffered.additionalProperty.push({
          "@type": "gs1:PropertyValue",
          "gs1:propertyName": "Lotto",
          "gs1:propertyValue": this.lot()
        });
      }

      if (this.expiration()) {
        jsonLdData.itemOffered.additionalProperty.push({
          "@type": "gs1:PropertyValue",
          "gs1:propertyName": "Scadenza",
          "gs1:propertyValue": this.expiration()
        });
      }
    }

    return JSON.stringify(jsonLdData);
  });

  private static readonly JSON_LD_SCRIPT_ID = 'product-structured-data';

  constructor() {
    // Pubblica lo script application/ld+json in modo imperativo, aggiornando lo stesso elemento
    // (per id) invece di legarlo al template con [innerHTML]: quest'ultimo, durante l'hydration,
    // fa sì che Angular aggiunga un secondo <script> lato client accanto a quello già presente
    // nell'HTML prerenderizzato invece di riutilizzarlo — il risultato è due blocchi JSON-LD
    // identici nella pagina finale (visibile in validator.schema.org come "2 record"). Questo
    // stesso pattern "trova per id, altrimenti crea" è quello che usano internamente i servizi
    // Meta/Title di Angular, che infatti non soffrono di questo problema.
    effect(() => this.applyJsonLd(this.jsonLdJson()));

    // Title/meta tag in un effect reattivo su product() (non in ngOnInit, chiamato una sola
    // volta): tra due prodotti la rotta è la stessa (/01/:gtin), quindi Angular riusa la stessa
    // istanza del componente senza richiamare ngOnInit — senza questo, titolo e meta tag
    // resterebbero quelli del prodotto precedente dopo una navigazione lato client.
    effect(() => {
      const prod = this.product();
      if (!prod) return;
      this.titleService.setTitle(`${prod.name} | Digital Link`);
      this.metaService.updateTag({ name: 'description', content: prod.description });
      this.metaService.updateTag({ property: 'og:title', content: prod.name });
      this.metaService.updateTag({ property: 'og:image', content: prod.image });
    });
  }

  private applyJsonLd(json: string | null): void {
    let script = this.document.getElementById(ProductComponent.JSON_LD_SCRIPT_ID) as HTMLScriptElement | null;
    if (!json) {
      script?.remove();
      return;
    }
    if (!script) {
      script = this.document.createElement('script');
      script.type = 'application/ld+json';
      script.id = ProductComponent.JSON_LD_SCRIPT_ID;
      this.document.body.appendChild(script);
    }
    script.textContent = json;
  }

  // Il componente viene distrutto (navigazione lato client verso un'altra rotta) prima che
  // l'effect possa rieseguire con jsonLdJson() a null: senza questa pulizia esplicita lo
  // script rimarrebbe orfano nel DOM, pubblicando dati strutturati del prodotto precedente
  // anche su pagine che non lo riguardano più.
  ngOnDestroy(): void {
    this.applyJsonLd(null);
  }

  ngOnInit(): void {
    // Risoluzione della piattaforma prima dell'esecuzione dei computed
    this.isBrowser.set(isPlatformBrowser(this.platformId));
  }

  setTab(tab: ProductTab): void {
    this.activeTab.set(tab);
  }

  selectImage(index: number): void {
    this.activeImageIndex.set(index);
  }

  openLightbox(): void {
    this.lightboxOpen.set(true);
  }

  closeLightbox(): void {
    this.lightboxOpen.set(false);
  }

  openJsonLdDrawer(): void {
    const prod = this.product();
    if (prod) this.uiState.openJsonLd(prod);
  }

  async copyDigitalLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.currentDigitalLink());
    } catch {
      /* clipboard unavailable — ignore */
    }
  }
}
