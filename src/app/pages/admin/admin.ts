import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { tap } from 'rxjs';
import { IconComponent, IconName } from '../../components/icon/icon';
import { JsonLdDrawerComponent } from '../../components/json-ld-drawer/json-ld-drawer';
import { SECTORS, Sector } from '../../data/sectors';
import { DppInput, DppRecord, GranularityLevel, PublishTechnicalTrace, RegistryApiService } from '../../services/registry-api.service';
import { SiteOriginService } from '../../services/site-origin.service';
import { DEMO_DATA } from './demo-data';
import { JourneyPhase } from './publish-journey/publish-journey';
import { DppWizardComponent } from './dpp-wizard/dpp-wizard';
import { hasIncompleteAttributeRow, isValidGtin } from '../../utils/gs1-validators';
import { buildDigitalLinkUpi, parseDigitalLink, parseGlnDigitalLink } from '../../utils/gs1-digital-link';
import { DEMO_ECONOMIC_OPERATOR_ID, DEMO_FACILITY_ID, DPP_SCHEMA_VERSION, toStandardDppStatus, toStandardGranularity } from '../../utils/dpp-jsonld';
import { ScrollRevealDirective } from '../../directives/scroll-reveal';

type View = 'checking' | 'login' | 'list' | 'wizard';

export type ToastSeverity = 'error' | 'warning';

/** Attese tra un tentativo automatico e l'altro quando il registro UE sta ancora "svegliandosi"
 * (vedi retryable in registry-api/src/routes/dpp.ts) — cumulate, coprono circa un minuto, la
 * durata tipica di un avvio a freddo osservata in questa integrazione. L'utente vede solo
 * l'animazione proseguire, mai un errore intermedio: vedi publish()/attemptPublish() sotto. */
const PUBLISH_RETRY_DELAYS_MS = [4000, 8000, 15000, 25000];

/**
 * Sezione admin per creare/modificare DPP e pubblicarli su mock-eu-registry (il registro
 * puntatori UE — vedi registry-api/src/mockRegistryClient.ts per il perché dell'architettura).
 * Non prerenderizzata: vedi RenderMode.Client in app.routes.server.ts.
 *
 * Form reattivi (ReactiveFormsModule): l'identificazione del prodotto è un solo campo, l'UPI in
 * formato URI GS1 Digital Link — GTIN e granularità (modello/lotto/articolo) si deducono dalla
 * sua sintassi tramite il GS1 Barcode Syntax Engine (vedi utils/gs1-digital-link.ts) invece di
 * essere chiesti come campi separati.
 */
@Component({
  selector: 'app-admin',
  imports: [CommonModule, ReactiveFormsModule, IconComponent, JsonLdDrawerComponent, ScrollRevealDirective, DppWizardComponent],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin {
  private api = inject(RegistryApiService);
  private titleService = inject(Title);
  private metaService = inject(Meta);
  private fb = inject(FormBuilder);
  private siteOrigin = inject(SiteOriginService);
  private platformId = inject(PLATFORM_ID);
  /** angularx-qrcode manipola direttamente il DOM: non è compatibile con SSR/prerender — non
   * che /admin lo sia mai (RenderMode.Client), ma resta la stessa guardia usata in home.ts. */
  protected isBrowser = isPlatformBrowser(this.platformId);

  protected sectors = SECTORS;

  protected view = signal<View>('checking');
  protected records = signal<DppRecord[]>([]);

  protected searchQuery = signal('');
  protected statusFilter = signal<'all' | 'draft' | 'published'>('all');
  protected statusFilters: { id: 'all' | 'draft' | 'published'; label: string }[] = [
    { id: 'all', label: 'Tutte' },
    { id: 'draft', label: 'In azienda' },
    { id: 'published', label: 'Registrate' },
  ];

  protected filteredRecords = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const status = this.statusFilter();
    return this.records().filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (!query) return true;
      return r.name.toLowerCase().includes(query) || r.gtin.includes(query);
    });
  });

  protected filterCount(status: 'all' | 'draft' | 'published'): number {
    return status === 'all' ? this.records().length : this.records().filter((r) => r.status === status).length;
  }

  protected onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  protected loginForm = this.fb.nonNullable.group({
    password: ['', Validators.required],
  });
  protected loginError = signal<string | null>(null);
  protected loginPending = signal(false);

  protected editingId = signal<string | null>(null);
  /** gtin/granularityLevel/batchOrSerial non sono più compilati direttamente: si deducono da
   * `upi` (vedi l'effect nel costruttore che li popola via parseDigitalLink) — restano nel
   * FormGroup solo perché il resto dell'app (buildInput(), l'anteprima, il Wizard) li legge già
   * così, e cambiare anche quel contratto avrebbe un raggio d'azione molto più ampio di questa
   * modifica. Nessun validator diretto su di loro: la validità si gioca tutta su `upi`. */
  protected dppForm = this.fb.nonNullable.group({
    sectorId: [SECTORS[0].id, Validators.required],
    name: ['', [Validators.required, Validators.minLength(2)]],
    upi: ['', Validators.required],
    gtin: [''],
    granularityLevel: ['MODEL' as GranularityLevel],
    batchOrSerial: [''],
    // economicOperatorId è obbligatorio nello schema, facilityId facoltativo: entrambi
    // compilabili qui come URI GS1 Digital Link con GLN (vedi dpp-wizard.html), precompilati con
    // l'identificativo demo così il form resta utilizzabile subito anche senza un GLN vero a
    // portata di mano.
    economicOperatorId: [DEMO_ECONOMIC_OPERATOR_ID, Validators.required],
    facilityId: [DEMO_FACILITY_ID],
    attributes: this.fb.array<FormGroup>([]),
  });
  /** L'intero valore del form come signal — la reattività di Angular Forms è basata su
   * Observable (valueChanges), qui ponte verso i signal usati dal resto del componente
   * (anteprima infografica, QR code, settore corrente). */
  protected formValue = toSignal(this.dppForm.valueChanges, { initialValue: this.dppForm.getRawValue() });

  /** Un solo toast alla volta, con severità: 'error' per problemi bloccanti (campo non valido,
   * salvataggio/pubblicazione falliti), 'warning' per avvisi non bloccanti (es. un attributo con
   * solo la chiave o solo il valore compilato — verrà semplicemente ignorato, non impedisce di
   * salvare). Mostrato solo al tentativo di procedere (Avanti/Salva), mai ad ogni tasto premuto —
   * il messaggio di errore sotto al singolo campo (fieldError()) resta sempre visibile a parte. */
  protected toast = signal<{ message: string; severity: ToastSeverity } | null>(null);

  protected showToast(message: string, severity: ToastSeverity = 'error'): void {
    this.toast.set({ message, severity });
  }
  protected savePending = signal(false);
  protected publishPending = signal(false);
  protected publishedRecord = computed(() => this.records().find((r) => r.id === this.editingId() && r.status === 'published') ?? null);

  /** I tre momenti del percorso, nell'ordine in cui accadono davvero: si salva il DPP nei propri
   * sistemi (può restare così indefinitamente, passo 5 del Wizard), solo in un secondo momento si
   * conferma l'invio al Registro UE (passo 6, vedi journeyOpen sotto), e solo dopo arriva la
   * conferma di registrazione vera. */
  protected formPhase = computed<1 | 2 | 3>(() => {
    if (this.publishedRecord()) return 3;
    if (this.editingId()) return 2;
    return 1;
  });

  /** true dal click su "Conferma e invia al Registro UE" (passo 6 del Wizard) in poi — prima di
   * allora quel passo mostra solo un riepilogo di cosa sta per lasciare i sistemi aziendali (solo
   * identificativi e hash, mai i dati di prodotto) con l'azione di conferma; una volta vero,
   * mostra il percorso animato verso il Registro UE (vedi PublishJourneyComponent), fino
   * all'esito. Resta true anche a esito ottenuto — resetJourney() lo riporta a false solo
   * quando si lascia la scheda per aprirne un'altra. */
  protected journeyOpen = signal(false);
  protected journeyPhase = signal<JourneyPhase>('running');
  protected journeyRecord = signal<DppRecord | null>(null);
  protected journeyError = signal<string | null>(null);
  protected journeyRegistryId = signal<string | null>(null);
  /** true quando siamo già ai tentativi automatici successivi al primo — la UI mostra una
   * rassicurazione in più senza mai nominare il motivo tecnico. */
  protected journeyLongWait = signal(false);
  /** Il payload/risposta reali scambiati con mock-eu-registry, per chi vuole vedere il
   * dettaglio tecnico dietro l'animazione (vedi PublishJourneyComponent) — valorizzato solo a
   * registrazione riuscita, non è un dato ricostruito lato client. */
  protected journeyTechnical = signal<PublishTechnicalTrace | null>(null);

  /** Il settore attualmente scelto nel form — pilota il pulsante dati demo, l'anteprima
   * infografica del passaporto e il QR code GS1 Digital Link qui sotto. */
  protected currentSector = computed<Sector>(() => this.sectors.find((s) => s.id === this.formValue().sectorId) ?? this.sectors[0]);

  /** gtin/granularityLevel/batchOrSerial dedotti dall'ultimo parsing riuscito di `upi` (vedi
   * l'effect nel costruttore, che scrive qui E sui controlli omonimi del FormGroup). Segnale
   * separato apposta: quei tre controlli vengono aggiornati con `emitEvent: false` (per non far
   * ripartire lo stesso effect che li scrive), quindi `formValue()` — che segue le sole
   * valueChanges — non li vedrebbe mai cambiare. I computed sotto che ne hanno bisogno per
   * l'anteprima (previewGtin e a cascata previewUpi/previewJsonLd) leggono questo invece. */
  protected derivedIdentity = signal<{ gtin: string; granularityLevel: GranularityLevel; batchOrSerial: string }>({
    gtin: '',
    granularityLevel: 'MODEL',
    batchOrSerial: '',
  });
  /** Esito dell'ultima validazione asincrona di economicOperatorId/facilityId (vedi i due effect
   * nel costruttore, stesso motivo di derivedIdentity qui sopra: il Wizard legge questi invece di
   * `.valid` sul controllo, che un metodo imperativo come isStepValid() non può osservare in modo
   * reattivo). facilityValid parte true perché il campo è facoltativo: vuoto è valido, non "non
   * ancora validato". */
  protected economicOperatorValid = signal(false);
  protected facilityValid = signal(true);
  /** GTIN corrente, solo se valido — l'anteprima e il QR code mostrano un GTIN solo quando è
   * un UPI reale, non una stringa a metà digitazione. Controllo diretto con isValidGtin() (la
   * stessa funzione pura usata dal validatore reattivo) come ulteriore rete di sicurezza, anche
   * se derivedIdentity().gtin arriva già da un parsing riuscito del GS1 Barcode Syntax Engine. */
  protected previewGtin = computed(() => {
    const gtin = this.derivedIdentity().gtin;
    return gtin && isValidGtin(gtin) ? gtin : null;
  });
  /** L'UPI — Unique Product Identifier — che verrà davvero inviato al DPP Registry UE al
   * momento della pubblicazione: un URI GS1 Digital Link, non il GTIN da solo (che è solo
   * l'identificativo numerico da cui l'UPI si costruisce — vedi l'etichetta del campo UPI qui
   * sopra). Stessa identica logica di registry-api/src/mockRegistryClient.ts#buildUpi,
   * duplicata qui solo per l'anteprima (due servizi separati, come il resto del contratto). */
  protected previewUpi = computed<string | null>(() => {
    const gtin = this.previewGtin();
    if (!gtin) return null;
    const base = `${this.siteOrigin.value}/01/${gtin}`;
    const identity = this.derivedIdentity();
    if (identity.granularityLevel === 'MODEL' || !identity.batchOrSerial) return base;
    const value = identity.batchOrSerial.replace(/^\(\d{2}\)\s*/, '').trim();
    if (!value) return base;
    const ai = identity.granularityLevel === 'ITEM' ? '21' : '10';
    return `${base}/${ai}/${encodeURIComponent(value)}`;
  });
  /** URI GS1 Digital Link codificato nel QR — lo stesso UPI che finirà nel Registro UE, non
   * solo la pagina base: chi lo scansiona, anche prima della pubblicazione, finisce esattamente
   * sulla scheda che si sta compilando (le route con AI (10)/(21) in coda risolvono anche
   * quelle, vedi app.routes.ts). */
  protected qrValue = computed<string | null>(() => this.previewUpi());

  /** Anteprima del JSON-LD (stessa logica di registry-api/src/jsonld.ts e product.ts —
   * vedi lì per il dettaglio dei termini GS1 Web Vocabulary usati), aggiornata mentre si
   * compila il form: mostra come apparirà la scheda anche prima di salvarla o pubblicarla.
   * Richiede solo un UPI valido — nome/attributi possono ancora essere vuoti. */
  protected previewJsonLd = computed<Record<string, unknown> | null>(() => {
    const gtin = this.previewGtin();
    if (!gtin) return null;
    const f = this.formValue();
    const identity = this.derivedIdentity();
    // Se stiamo modificando una scheda già salvata, usiamo i suoi valori reali (id, stato,
    // ultimo aggiornamento) invece di segnaposto — stessa idea di registry-api/src/jsonld.ts.
    const existing = this.records().find((r) => r.id === this.editingId());

    const doc: Record<string, unknown> = {
      // gs1/schema come prefissi bastano da soli — vedi il commento nello stesso punto di
      // registry-api/src/jsonld.ts#dppToJsonLd per il dettaglio di ogni campo di questo oggetto.
      '@context': {
        gs1: 'https://ref.gs1.org/voc/',
        schema: 'http://schema.org/',
      },
      '@type': ['schema:Product', 'gs1:Product'],
      '@id': `${this.siteOrigin.value}/01/${gtin}`,
      digitalProductPassportId: existing ? `urn:uuid:${existing.id}` : 'urn:uuid:(assegnato al salvataggio)',
      uniqueProductIdentifier: this.previewUpi(),
      'schema:name': f.name || null,
      'gs1:gtin': gtin,
      granularity: toStandardGranularity(identity.granularityLevel),
      dppSchemaVersion: DPP_SCHEMA_VERSION,
      dppStatus: toStandardDppStatus(existing?.status ?? 'draft'),
      lastUpdate: existing?.updatedAt ?? new Date().toISOString(),
      economicOperatorId: f.economicOperatorId || DEMO_ECONOMIC_OPERATOR_ID,
      facilityId: f.facilityId || DEMO_FACILITY_ID,
      contentSpecificationIds: [this.currentSector().contentSpecificationId],
    };

    if (identity.batchOrSerial) {
      const value = identity.batchOrSerial.replace(/^\(\d{2}\)\s*/, '').trim();
      if (identity.granularityLevel === 'ITEM') {
        doc['gs1:hasSerialNumber'] = value;
      } else {
        doc['gs1:hasBatchLotNumber'] = value;
      }
    }

    // Ogni attributo come chiave di primo livello, non più avvolti in
    // schema:additionalProperty/PropertyValue — vedi jsonld.ts#dppToJsonLd. Stessa guardia
    // anti-collisione: un attributo che si chiama come un campo dell'intestazione (es.
    // "granularity") viene ignorato invece di sovrascriverlo in silenzio.
    const attrs = (f.attributes as { key: string; value: string }[]).filter((row) => row.key?.trim());
    for (const row of attrs) {
      const key = row.key.trim();
      if (key in doc) continue;
      doc[key] = row.value;
    }

    if (existing?.registryId) {
      // Il DPP Registry UE restituisce "registrationId", non "registryId" (nome solo nostro,
      // interno).
      doc['registrationId'] = existing.registryId;
    }

    return doc;
  });

  protected jsonLdPreviewOpen = signal(false);

  protected openJsonLdPreview(): void {
    this.jsonLdPreviewOpen.set(true);
  }

  protected closeJsonLdPreview(): void {
    this.jsonLdPreviewOpen.set(false);
  }

  constructor() {
    this.titleService.setTitle('Amministrazione DPP | GS1 Italy DPP');
    this.metaService.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    this.loadRecords().subscribe({
      next: () => this.view.set('list'),
      error: (err: HttpErrorResponse) => this.view.set(err.status === 401 ? 'login' : 'list'),
    });

    // mock-eu-registry serve solo qui (pubblicazione), mai sulle pagine pubbliche — vedi
    // App.wakeRegistryApi() per il risveglio di registry-api stesso, già in corso su ogni
    // pagina del sito da prima che l'utente arrivi qui. Un ping in anticipo appena si apre
    // l'admin, così è già sveglio quando l'utente arriva al click su "Pubblica" invece di
    // iniziare il risveglio solo in quel momento (il retry di PUBLISH_RETRY_DELAYS_MS resta
    // comunque la rete di sicurezza se non bastasse).
    if (this.isBrowser) fetch('/registry-api/warmup').catch(() => {});

    // Unico punto in cui gtin/granularityLevel/batchOrSerial vengono scritti: si deducono da
    // `upi` tramite il GS1 Barcode Syntax Engine (vedi utils/gs1-digital-link.ts) ogni volta che
    // cambia. Scritti in DUE posti — il FormGroup (patchValue, con emitEvent:false per non far
    // ripartire questo stesso effect, che dipende da formValue()) per buildInput()/getRawValue()
    // al salvataggio, e derivedIdentity (un signal separato) perché i computed dell'anteprima
    // (previewGtin e a cascata previewUpi/previewJsonLd) possano reagirci — emitEvent:false li
    // renderebbe altrimenti ciechi a questo cambiamento, dato che dipendono da formValue().
    // La guardia sul valore corrente prima di applicare l'esito, sotto in entrambi i
    // .then()/.catch(), scarta un risultato ormai superato se l'utente ha continuato a digitare
    // nel frattempo (il parsing è asincrono — inizializza il modulo Wasm al primo utilizzo —
    // quindi due chiamate in rapida sequenza possono risolversi fuori ordine).
    effect(() => {
      const raw = this.formValue().upi ?? '';
      const value = raw.trim();
      const upiControl = this.dppForm.controls.upi;
      if (!value) {
        // Vuoto: basta l'errore 'required' dei validatori sincroni del controllo, già
        // ricalcolato da Angular prima che questo effect leggesse formValue() — qui serve solo
        // a ripulire un eventuale upiInvalid rimasto da un tentativo precedente.
        upiControl.setErrors({ required: true });
        this.dppForm.patchValue({ gtin: '', granularityLevel: 'MODEL', batchOrSerial: '' }, { emitEvent: false });
        this.derivedIdentity.set({ gtin: '', granularityLevel: 'MODEL', batchOrSerial: '' });
        return;
      }
      parseDigitalLink(value).then(
        (parsed) => {
          if (this.dppForm.controls.upi.value.trim() !== value) return;
          upiControl.setErrors(null);
          this.dppForm.patchValue(
            { gtin: parsed.gtin, granularityLevel: parsed.granularityLevel, batchOrSerial: parsed.batchOrSerial },
            { emitEvent: false }
          );
          this.derivedIdentity.set(parsed);
        },
        (err: unknown) => {
          if (this.dppForm.controls.upi.value.trim() !== value) return;
          const message = err instanceof Error ? err.message : 'URI GS1 Digital Link non valido.';
          upiControl.setErrors({ upiInvalid: { message } });
          this.dppForm.patchValue({ gtin: '', granularityLevel: 'MODEL', batchOrSerial: '' }, { emitEvent: false });
          this.derivedIdentity.set({ gtin: '', granularityLevel: 'MODEL', batchOrSerial: '' });
        }
      );
    });

    // economicOperatorId/facilityId: stessa idea dell'effect su upi qui sopra, ma senza dover
    // dedurre altri campi — qui basta sapere se il link è un GLN valido col giusto Application
    // Identifier (417 per l'operatore, 414 per lo stabilimento), vedi utils/gs1-digital-link.ts.
    effect(() => {
      const value = (this.formValue().economicOperatorId ?? '').trim();
      const control = this.dppForm.controls.economicOperatorId;
      if (!value) {
        control.setErrors({ required: true });
        this.economicOperatorValid.set(false);
        return;
      }
      parseGlnDigitalLink(value, '417').then(
        () => {
          if (this.dppForm.controls.economicOperatorId.value.trim() !== value) return;
          control.setErrors(null);
          this.economicOperatorValid.set(true);
        },
        (err: unknown) => {
          if (this.dppForm.controls.economicOperatorId.value.trim() !== value) return;
          const message = err instanceof Error ? err.message : 'URI GS1 Digital Link non valido.';
          control.setErrors({ glnInvalid: { message } });
          this.economicOperatorValid.set(false);
        }
      );
    });

    effect(() => {
      const value = (this.formValue().facilityId ?? '').trim();
      const control = this.dppForm.controls.facilityId;
      if (!value) {
        // Facoltativo per lo standard: vuoto è un valore valido, non un errore.
        control.setErrors(null);
        this.facilityValid.set(true);
        return;
      }
      parseGlnDigitalLink(value, '414').then(
        () => {
          if (this.dppForm.controls.facilityId.value.trim() !== value) return;
          control.setErrors(null);
          this.facilityValid.set(true);
        },
        (err: unknown) => {
          if (this.dppForm.controls.facilityId.value.trim() !== value) return;
          const message = err instanceof Error ? err.message : 'URI GS1 Digital Link non valido.';
          control.setErrors({ glnInvalid: { message } });
          this.facilityValid.set(false);
        }
      );
    });

    // Il toast (vedi admin.html/.css) resta a posizione fissa sullo schermo: si vede sempre,
    // anche dopo aver scorso una form lunga — non basta più mostrare l'errore solo in cima alla
    // pagina, l'utente non è detto ci torni con lo sguardo. Si chiude da solo dopo un po' o col
    // pulsante di chiusura; ogni nuovo errore riparte da zero.
    effect((onCleanup) => {
      if (!this.toast()) return;
      const timer = setTimeout(() => this.toast.set(null), 6000);
      onCleanup(() => clearTimeout(timer));
    });

  }

  /** Ricarica l'elenco (`records`) e lo restituisce come Observable, senza toccare `view` —
   * chi chiama decide dove restare (es. saveDraft resta sul form dopo il salvataggio, non
   * torna all'elenco). Un solo subscribe effettivo: l'aggiornamento di `records` è un tap. */
  private loadRecords() {
    return this.api.list().pipe(tap((records) => this.records.set(records)));
  }

  /** Messaggio di errore leggibile per un campo, solo dopo che l'utente ci ha interagito —
   * mai in rosso su un campo ancora vuoto e intonso. Un solo messaggio alla volta: il primo
   * errore attivo, quello più utile da risolvere per primo. */
  protected fieldError(name: keyof typeof this.dppForm.controls): string | null {
    const control = this.dppForm.controls[name];
    if (!control.errors || !(control.dirty || control.touched)) return null;
    const firstError = Object.values(control.errors)[0] as { message?: string } | undefined;
    return firstError?.message ?? null;
  }

  /** Riepilogo leggibile dei soli campi non validi, per il toast d'errore mostrato al tentativo
   * di salvare (vedi saveDraft()) — il messaggio specifico di ciascun campo resta comunque sotto
   * al campo stesso (fieldError()), questo è solo un richiamo visibile anche se l'utente non ha
   * ancora scorso fin lì. */
  private buildValidationSummary(): string {
    const labels: Partial<Record<keyof typeof this.dppForm.controls, string>> = {
      name: 'Nome prodotto',
      upi: 'UPI (GS1 Digital Link)',
    };
    const invalidFields = (Object.keys(labels) as (keyof typeof labels)[]).filter((key) => this.dppForm.controls[key as keyof typeof this.dppForm.controls].invalid).map((key) => labels[key]);
    if (!invalidFields.length) return 'Controlla i campi evidenziati prima di continuare.';
    return `Controlla: ${invalidFields.join(', ')}.`;
  }

  protected submitLogin(): void {
    this.loginForm.markAllAsTouched();
    if (this.loginForm.invalid) return;
    this.loginError.set(null);
    this.loginPending.set(true);
    this.api.login(this.loginForm.getRawValue().password).subscribe({
      next: () => {
        this.loginPending.set(false);
        this.loginForm.reset();
        this.loadRecords().subscribe({ next: () => this.view.set('list') });
      },
      error: (err: HttpErrorResponse) => {
        this.loginPending.set(false);
        this.loginError.set(err.error?.error ?? 'Errore di accesso.');
      },
    });
  }

  protected logout(): void {
    this.api.logout().subscribe(() => this.view.set('login'));
  }

  /** Azzera lo stato del percorso di registrazione (vedi i segnali journey* qui sopra) — va
   * richiamato ogni volta che si lascia il form di un DPP per aprirne un altro (nuovo o in
   * modifica) o tornare all'elenco: journeyOpen/journeyRecord ecc. restano valorizzati finché non
   * richiamato, quindi senza questo reset il percorso della registrazione PRECEDENTE riappariva —
   * con il suo JSON e il suo registryId — non appena si apriva un altro DPP. */
  private resetJourney(): void {
    this.journeyOpen.set(false);
    this.journeyPhase.set('running');
    this.journeyRecord.set(null);
    this.journeyError.set(null);
    this.journeyRegistryId.set(null);
    this.journeyLongWait.set(false);
    this.journeyTechnical.set(null);
  }

  /** Unica modalità di compilazione (il form a pagina singola e la schermata di scelta
   * 'create-choice' sono stati rimossi su richiesta esplicita): "Crea DPP" apre direttamente
   * il Wizard guidato. */
  protected startCreate(): void {
    this.editingId.set(null);
    this.dppForm.reset({
      sectorId: SECTORS[0].id,
      name: '',
      upi: '',
      gtin: '',
      granularityLevel: 'MODEL',
      batchOrSerial: '',
      economicOperatorId: DEMO_ECONOMIC_OPERATOR_ID,
      facilityId: DEMO_FACILITY_ID,
    });
    this.attributesArray.clear();
    this.toast.set(null);
    this.resetJourney();
    this.view.set('wizard');
  }

  protected startEdit(record: DppRecord): void {
    // Rete di sicurezza oltre a quella già in admin.html (che nasconde il pulsante "Apri" per
    // queste righe): niente dipende SOLO dal template per una regola che conta anche lato server
    // (routes/dpp.ts/routes/v1.ts rifiutano comunque la scrittura, ma qui evitiamo anche di aprire
    // un wizard che finirebbe per fallire al salvataggio).
    if (record.isStatic) return;
    this.editingId.set(record.id);
    this.dppForm.reset({
      sectorId: record.sectorId,
      // upi è l'unico campo che l'utente vede/modifica: lo ricostruiamo dai valori già scomposti
      // del record salvato (vedi buildDigitalLinkUpi) — l'effect nel costruttore lo riparserà
      // subito dopo, ridando gtin/granularityLevel/batchOrSerial (qui sotto solo come stato
      // iniziale, in attesa di quel primo giro).
      upi: buildDigitalLinkUpi(this.siteOrigin.value, record.gtin, record.granularityLevel, record.batchOrSerial ?? ''),
      gtin: record.gtin,
      name: record.name,
      granularityLevel: record.granularityLevel,
      batchOrSerial: record.batchOrSerial ?? '',
      economicOperatorId: record.economicOperatorId,
      facilityId: record.facilityId,
    });
    this.attributesArray.clear();
    for (const [key, value] of Object.entries(record.attributes)) {
      this.attributesArray.push(this.attributeGroup(key, value));
    }
    this.toast.set(null);
    this.resetJourney();
    this.view.set('wizard');
  }

  protected cancelForm(): void {
    this.resetJourney();
    this.view.set('list');
  }

  /** Popola il form con dati fittizi plausibili per il settore attualmente selezionato — solo
   * per velocizzare la demo. Sovrascrive tutto, GTIN incluso: dopo un cambio di settore l'utente
   * si aspetta una scheda demo coerente col nuovo settore, non un GTIN rimasto del precedente.
   * I GTIN demo (vedi data/sectors.ts) hanno una cifra di controllo GS1 valida, quindi passano
   * la stessa validazione di un GTIN vero. */
  protected fillDemoData(): void {
    const sector = this.currentSector();
    const demo = DEMO_DATA[sector.id];
    if (!demo) return;
    this.dppForm.patchValue({
      upi: buildDigitalLinkUpi(this.siteOrigin.value, sector.exampleGtin, demo.granularityLevel, demo.batchOrSerial),
      name: demo.name,
    });
    this.fillDemoAttributes();
  }

  /** Sottoinsieme di fillDemoData() che tocca solo gli attributi — usato dal Wizard al passo
   * "Attributi" (dpp-wizard.ts), dove a differenza del form a pagina singola l'utente ha già
   * scelto identificazione/granularità nei passi precedenti: sovrascriverle di nuovo qui
   * sarebbe una sorpresa sgradita, non un aiuto. */
  protected fillDemoAttributes(): void {
    const sector = this.currentSector();
    const demo = DEMO_DATA[sector.id];
    if (!demo) return;
    this.attributesArray.clear();
    for (const [key, value] of Object.entries(demo.attributes)) {
      this.attributesArray.push(this.attributeGroup(key, value));
    }
  }

  /** Come fillDemoData(), ma per un solo campo scalare — il piccolo link "Usa demo" accanto a
   * ciascun campo (admin.html/dpp-wizard.html), per chi vuole solo un esempio veloce per QUEL
   * campo invece di sovrascrivere tutto il DPP. */
  protected demoFillField(field: 'name' | 'upi' | 'economicOperatorId' | 'facilityId'): void {
    if (field === 'economicOperatorId') {
      this.dppForm.controls.economicOperatorId.setValue(DEMO_ECONOMIC_OPERATOR_ID);
      return;
    }
    if (field === 'facilityId') {
      this.dppForm.controls.facilityId.setValue(DEMO_FACILITY_ID);
      return;
    }
    const sector = this.currentSector();
    const demo = DEMO_DATA[sector.id];
    if (!demo) return;
    if (field === 'upi') {
      this.dppForm.controls.upi.setValue(buildDigitalLinkUpi(this.siteOrigin.value, sector.exampleGtin, demo.granularityLevel, demo.batchOrSerial));
      return;
    }
    this.dppForm.controls.name.setValue(demo.name);
  }

  protected get attributesArray(): FormArray<FormGroup> {
    return this.dppForm.controls.attributes;
  }

  private attributeGroup(key = '', value = ''): FormGroup {
    return this.fb.nonNullable.group({ key: [key], value: [value] });
  }

  protected addAttributeRow(): void {
    this.attributesArray.push(this.attributeGroup());
  }

  protected removeAttributeRow(index: number): void {
    this.attributesArray.removeAt(index);
  }

  private buildInput(): DppInput {
    const f = this.dppForm.getRawValue();
    const attributes: Record<string, string> = {};
    for (const row of f.attributes as { key: string; value: string }[]) {
      if (row.key.trim()) attributes[row.key.trim()] = row.value;
    }
    return {
      sectorId: f.sectorId,
      gtin: f.gtin.trim(),
      name: f.name.trim(),
      granularityLevel: f.granularityLevel,
      batchOrSerial: f.batchOrSerial.trim() || null,
      economicOperatorId: f.economicOperatorId.trim() || DEMO_ECONOMIC_OPERATOR_ID,
      facilityId: f.facilityId.trim() || DEMO_FACILITY_ID,
      attributes,
    };
  }

  protected saveDraft(): void {
    this.dppForm.markAllAsTouched();
    if (this.dppForm.invalid) {
      this.showToast(this.buildValidationSummary(), 'error');
      return;
    }
    if (hasIncompleteAttributeRow(this.dppForm.getRawValue().attributes as { key: string; value: string }[])) {
      this.showToast('Un attributo ha solo il nome o solo il valore compilato: verrà ignorato al salvataggio.', 'warning');
    } else {
      this.toast.set(null);
    }
    this.savePending.set(true);
    const input = this.buildInput();
    const id = this.editingId();
    const request = id ? this.api.update(id, input) : this.api.create(input);
    request.subscribe({
      next: (record) => {
        this.savePending.set(false);
        this.editingId.set(record.id);
        this.view.set('wizard');
        this.loadRecords().subscribe();
      },
      error: (err: HttpErrorResponse) => {
        this.savePending.set(false);
        this.showToast(err.error?.error ?? 'Errore durante il salvataggio.', 'error');
      },
    });
  }

  /** Click su "Conferma e invia al Registro UE" nel passo 6 del Wizard. */
  protected confirmPublish(): void {
    const id = this.editingId();
    if (!id) return;
    this.toast.set(null);
    this.publishPending.set(true);

    this.journeyRecord.set(this.records().find((r) => r.id === id) ?? null);
    this.journeyError.set(null);
    this.journeyRegistryId.set(null);
    this.journeyLongWait.set(false);
    this.journeyTechnical.set(null);
    this.journeyPhase.set('running');
    this.journeyOpen.set(true);

    this.attemptPublish(id, 0);
  }

  /** Un tentativo di pubblicazione. Se il registro risponde "riprova" (retryable, vedi
   * registry-api/src/routes/dpp.ts), non mostra alcun errore: aspetta e riprova da sola,
   * restando nella fase 'running' — solo l'ultimo, vero fallimento arriva all'utente, in
   * linguaggio semplice. */
  private attemptPublish(id: string, attempt: number): void {
    this.api.publish(id).subscribe({
      next: (record) => {
        this.publishPending.set(false);
        this.journeyPhase.set('success');
        this.journeyRegistryId.set(record.registryId);
        this.journeyTechnical.set(record.technical ?? null);
        this.loadRecords().subscribe();
      },
      error: (err: HttpErrorResponse) => {
        const retryable = err.error?.retryable === true;
        if (retryable && attempt < PUBLISH_RETRY_DELAYS_MS.length) {
          if (attempt >= 1) this.journeyLongWait.set(true);
          setTimeout(() => this.attemptPublish(id, attempt + 1), PUBLISH_RETRY_DELAYS_MS[attempt]);
          return;
        }
        this.publishPending.set(false);
        this.journeyPhase.set('error');
        this.journeyError.set(
          retryable ? 'Il servizio non risponde da un po’. Riprova tra qualche minuto.' : err.error?.error ?? 'Qualcosa non ha funzionato. Riprova.'
        );
      },
    });
  }

  protected deleteRecord(record: DppRecord): void {
    if (record.isStatic) return;
    if (!confirm(`Eliminare il DPP "${record.name}"?`)) return;
    this.api.delete(record.id).subscribe({
      next: () => this.loadRecords().subscribe(),
      error: (err: HttpErrorResponse) => this.showToast(err.error?.error ?? 'Errore durante l\'eliminazione.', 'error'),
    });
  }

  protected sectorName(sectorId: string): string {
    return this.sectors.find((s) => s.id === sectorId)?.name ?? sectorId;
  }

  /** Icona/colore del settore per la colonna "Prodotto" dell'elenco — stesso .icon-flat usato
   * per le card settore e l'anteprima passaporto, qui in miniatura accanto al nome. */
  protected sectorIcon(sectorId: string): IconName {
    return this.sectors.find((s) => s.id === sectorId)?.icon ?? 'box';
  }

  protected sectorBrandColor(sectorId: string): string {
    return this.sectors.find((s) => s.id === sectorId)?.brandColor ?? 'var(--brand)';
  }
}
