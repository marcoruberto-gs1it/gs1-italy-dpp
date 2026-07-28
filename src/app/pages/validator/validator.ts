import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, Injector, OnDestroy, OnInit, PLATFORM_ID, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import type QrScanner from 'qr-scanner';
import { I18nService } from '../../services/i18n.service';
import { SiteOriginService } from '../../services/site-origin.service';
import { Product, ProductService } from '../../services/product.service';

interface AiEntry {
  ai: string;
  label: string;
  value: string;
}

// Continuità con l'esempio storico di questa pagina, ma verificato dinamicamente contro il
// catalogo reale (vedi pickExampleProduct) invece che imposto come stringa fissa: un Digital
// Link inventato o un lotto/seriale non allineato al traceabilityExample del prodotto
// risulterebbe in un 404 aprendolo davvero (es. dal pulsante "Valida su validator.schema.org",
// che scarica per davvero la pagina) — le rotte /01/:gtin/10/:lot/21/:serial sono prerenderizzate
// solo per le combinazioni curate in traceabilityExample (vedi app.routes.server.ts).
const PREFERRED_EXAMPLE_GTIN = '08032089000024';

function pickExampleProduct(products: Product[]): Product | undefined {
  const eligible = products.filter((p) => p.rawGs1Data && p.traceabilityExample);
  return eligible.find((p) => p.gtin === PREFERRED_EXAMPLE_GTIN) ?? eligible[0];
}

// Separatore di campo FNC1 come restituito da un vero lettore barcode (ASCII 29, "Group
// Separator") quando un QR/Data Matrix GS1 codifica una stringa AI non bracketizzata invece di
// un Digital Link. Il motore si aspetta questo stesso ruolo espresso col carattere "^" (vedi
// GS1encoder#dataStr) — una fotocamera generica non fornisce l'identificativo di simbologia AIM
// che richiederebbe l'API scanData, quindi normalizziamo a mano invece.
const GS_SEPARATOR = '\u001d';

function normalizeScanForEngine(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const withCarets = trimmed.split(GS_SEPARATOR).join('^');
  return withCarets.startsWith('^') ? withCarets : `^${withCarets}`;
}

/**
 * Analizza un GS1 Digital Link (o una stringa AI tra parentesi) usando il vero GS1 Barcode
 * Syntax Engine di GS1 (https://github.com/gs1/gs1-syntax-engine), compilato in WASM e
 * pubblicato come pacchetto npm "gs1encoder" dallo stesso maintainer del progetto GS1. Non è
 * una reimplementazione: è la stessa libreria C usata dagli strumenti ufficiali GS1.
 */
@Component({
  selector: 'app-validator',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './validator.html',
  styleUrl: './validator.css',
})
export class ValidatorComponent implements OnInit, OnDestroy {
  private platformId = inject(PLATFORM_ID);
  private titleService = inject(Title);
  private siteOrigin = inject(SiteOriginService);
  private productService = inject(ProductService);
  private injector = inject(Injector);
  protected t = inject(I18nService).t;

  // validator.schema.org scarica davvero la pagina che gli si passa: gli esempi devono quindi
  // puntare a un URL realmente raggiungibile sul dominio corrente (vedi SiteOriginService) e a
  // un prodotto/lotto/seriale realmente esistenti nel catalogo (vedi pickExampleProduct), non a
  // un dominio o identificativi fittizi.
  private exampleProduct = pickExampleProduct(this.productService.getAllProducts());
  protected readonly exampleSimple = `${this.siteOrigin.value}/01/${this.exampleProduct?.gtin ?? PREFERRED_EXAMPLE_GTIN}`;
  protected readonly exampleInstance = this.exampleProduct?.traceabilityExample
    ? `${this.exampleSimple}/10/${this.exampleProduct.traceabilityExample.lot}/21/${this.exampleProduct.traceabilityExample.serial}`
    : this.exampleSimple;

  isBrowser = signal(false);
  input = signal('');
  loading = signal(false);
  analyzed = signal(false);
  error = signal<string | null>(null);
  errorDetail = signal<string | null>(null);
  aiEntries = signal<AiEntry[]>([]);
  canonicalUri = signal<string | null>(null);
  testableUri = signal<string | null>(null);
  ignoredParams = signal<string[]>([]);
  engineVersion = signal<string | null>(null);
  copied = signal(false);

  private scanVideoRef = viewChild<ElementRef<HTMLVideoElement>>('scanVideo');
  private qrScanner: QrScanner | null = null;
  private audioContext: AudioContext | null = null;
  scannerOpen = signal(false);
  scannerStarting = signal(false);
  scannerError = signal<string | null>(null);

  hasResult = computed(() => this.aiEntries().length > 0);

  schemaOrgUrl = computed(() => {
    // Se l'input è già un URL lo testiamo così com'è (è quello che l'utente vuole verificare
    // davvero); solo se ha incollato una stringa AI tra parentesi usiamo l'URI ricostruito su
    // QUESTO dominio (testableUri), l'unico che validator.schema.org può davvero scaricare —
    // il resolver ufficiale id.gs1.org non conosce i GTIN fittizi di questa demo.
    const raw = this.input().trim();
    const url = /^https?:\/\//i.test(raw) ? raw : (this.testableUri() ?? this.canonicalUri() ?? raw);
    return `https://validator.schema.org/#url=${encodeURIComponent(url)}`;
  });

  // Euristica per il formato "compresso" dei GS1 Digital Link: il gs1-syntax-engine (motore
  // usato da questo validatore) non lo supporta — richiede una libreria di (de)compressione
  // separata che GS1 non pubblica all'interno di questo progetto ufficiale. Se l'input è un URL
  // il cui primo segmento di path non è puramente numerico (quindi non un AI riconoscibile come
  // "/01/...", "/00/...", ecc.) è probabile che sia proprio un DL compresso: lo segnaliamo invece
  // di lasciare che l'utente veda solo l'errore grezzo del motore.
  compressedDlHint = computed(() => {
    if (!this.error()) return false;
    const match = this.input().trim().match(/^https?:\/\/[^/]+\/([^/?#]+)/i);
    return !!match && !/^\d+$/.test(match[1]);
  });

  ngOnInit(): void {
    this.isBrowser.set(isPlatformBrowser(this.platformId));
    if (this.isBrowser()) {
      this.input.set(this.exampleInstance);
    }
    this.titleService.setTitle(this.t('validator.pageTitle'));
  }

  setInput(value: string): void {
    this.input.set(value);
  }

  loadExample(value: string): void {
    this.input.set(value);
    void this.analyze();
  }

  async analyze(): Promise<void> {
    const value = this.input().trim();
    this.error.set(null);
    this.errorDetail.set(null);
    this.aiEntries.set([]);
    this.canonicalUri.set(null);
    this.testableUri.set(null);
    this.ignoredParams.set([]);
    this.analyzed.set(true);
    if (!value) return;

    this.loading.set(true);
    try {
      const { GS1encoder } = await import('gs1encoder');
      const gs = await GS1encoder.create();
      try {
        this.engineVersion.set(gs.version);
        gs.includeDataTitlesInHRI = true;
        gs.dataStr = value;

        this.aiEntries.set(gs.hri.map(parseHriLine));

        try {
          this.canonicalUri.set(gs.getDLuri(null));
        } catch {
          this.canonicalUri.set(null);
        }

        // Deriviamo l'URL testabile sostituendo solo l'host nell'URI canonico già calcolato,
        // invece di richiamare di nuovo gs.getDLuri() sulla stessa istanza WASM con uno stem
        // diverso: quella seconda chiamata destabilizza il motore (nessun'eccezione JS
        // catturabile, ma le chiamate successive smettono di produrre risultati).
        const canonical = this.canonicalUri();
        this.testableUri.set(canonical ? canonical.replace(/^https?:\/\/[^/]+/, this.siteOrigin.value) : null);

        this.ignoredParams.set(gs.dlIgnoredQueryParams);
      } finally {
        gs.free();
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : this.t('validator.unknownError'));
    } finally {
      this.loading.set(false);
    }
  }

  openSchemaValidator(): void {
    if (!this.isBrowser()) return;
    window.open(this.schemaOrgUrl(), '_blank', 'noopener');
  }

  async copyCanonicalUri(): Promise<void> {
    const uri = this.canonicalUri();
    if (!uri) return;
    try {
      await navigator.clipboard.writeText(uri);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  openScanner(): void {
    if (!this.isBrowser()) return;
    this.scannerError.set(null);
    this.scannerStarting.set(true);
    this.scannerOpen.set(true);
    // Creato qui, dentro il click handler dell'utente (un vero "user gesture"), cosicché
    // l'AudioContext sia già sbloccato quando serve riprodurre il bip al momento della scansione
    // — a quel punto siamo dentro il callback asincrono del decoder, che i browser non
    // considerano un gesture valido per sbloccarlo da zero.
    if (!this.audioContext) {
      try {
        this.audioContext = new AudioContext();
      } catch {
        /* Web Audio non disponibile — il bip verrà semplicemente omesso */
      }
    }
    // Il <video #scanVideo> esiste nel DOM solo dopo che scannerOpen() diventa true (è dietro un
    // @if): afterNextRender attende che Angular abbia davvero applicato questo aggiornamento al
    // DOM prima di leggere il viewChild — una queueMicrotask() non basta, perché il render
    // effettivo può avvenire dopo il prossimo giro di microtask.
    afterNextRender(() => void this.startCamera(), { injector: this.injector });
  }

  closeScanner(): void {
    this.qrScanner?.stop();
    this.qrScanner?.destroy();
    this.qrScanner = null;
    this.scannerOpen.set(false);
    this.scannerStarting.set(false);
  }

  onScannerBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeScanner();
  }

  private async startCamera(): Promise<void> {
    const video = this.scanVideoRef()?.nativeElement;
    if (!video) {
      this.scannerStarting.set(false);
      this.scannerError.set(this.t('validator.scanNoVideo'));
      return;
    }

    try {
      const { default: QrScannerCtor } = await import('qr-scanner');
      const hasCamera = await QrScannerCtor.hasCamera();
      if (!hasCamera) {
        this.scannerStarting.set(false);
        this.scannerError.set(this.t('validator.scanNoCamera'));
        return;
      }

      this.qrScanner = new QrScannerCtor(video, (result) => this.onScanResult(result.data), {
        preferredCamera: 'environment',
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 5,
      });
      await this.qrScanner.start();
      this.scannerStarting.set(false);
    } catch (err) {
      this.scannerStarting.set(false);
      this.scannerError.set(err instanceof Error ? err.message : this.t('validator.scanGenericError'));
    }
  }

  private onScanResult(rawData: string): void {
    this.playBeep();
    this.closeScanner();
    this.input.set(normalizeScanForEngine(rawData));
    void this.analyze();
  }

  // Bip sintetizzato al volo con la Web Audio API invece di un file audio: nessun asset da
  // scaricare, un singolo tono pulito (tipico "beep" da lettore barcode) coperto per intero da
  // codice.
  private playBeep(): void {
    const ctx = this.audioContext;
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 1800;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.13);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.14);
  }

  ngOnDestroy(): void {
    this.qrScanner?.stop();
    this.qrScanner?.destroy();
    this.qrScanner = null;
    this.audioContext?.close();
    this.audioContext = null;
  }
}

function parseHriLine(line: string): AiEntry {
  const match = line.match(/^(.*?)\s*\((\d+)\)\s*(.*)$/);
  if (match) {
    return { label: match[1], ai: match[2], value: match[3] };
  }
  return { label: '', ai: '', value: line };
}
