import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { tap } from 'rxjs';
import { QRCodeComponent } from 'angularx-qrcode';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { IconComponent } from '../../components/icon/icon';
import { JsonLdDrawerComponent } from '../../components/json-ld-drawer/json-ld-drawer';
import { SECTORS, Sector } from '../../data/sectors';
import { DppInput, DppRecord, GranularityLevel, PublishTechnicalTrace, RegistryApiService } from '../../services/registry-api.service';
import { SiteOriginService } from '../../services/site-origin.service';
import { DEMO_DATA } from './demo-data';
import { JourneyPhase, PublishJourneyComponent } from './publish-journey/publish-journey';
import { batchOrSerialValidator, gtinValidator, isValidGtin } from '../../utils/gs1-validators';
import { ScrollRevealDirective } from '../../directives/scroll-reveal';

type View = 'checking' | 'login' | 'list' | 'form';

const GRANULARITY_LEVELS: GranularityLevel[] = ['MODEL', 'BATCH', 'ITEM'];

/** Attese tra un tentativo automatico e l'altro quando il registro UE sta ancora "svegliandosi"
 * (vedi retryable in registry-api/src/routes/dpp.ts) — cumulate, coprono circa un minuto, la
 * durata tipica di un avvio a freddo osservata in questa integrazione. L'utente vede solo
 * l'animazione proseguire, mai un errore intermedio: vedi publish()/attemptPublish() sotto. */
const PUBLISH_RETRY_DELAYS_MS = [4000, 8000, 15000, 25000];

/**
 * Sezione admin per creare/modificare schede DPP e pubblicarle su mock-eu-registry
 * (il registro puntatori UE — vedi registry-api/src/mockRegistryClient.ts per il perché
 * dell'architettura). Non prerenderizzata: vedi RenderMode.Client in app.routes.server.ts.
 *
 * Form reattivi (ReactiveFormsModule): la validazione dei campi identificativi (UPI/GTIN,
 * lotto/seriale) segue gli algoritmi reali degli standard GS1 (vedi utils/gs1-validators.ts),
 * non un generico controllo di lunghezza — un GTIN con la cifra di controllo sbagliata viene
 * segnalato subito, con il valore corretto suggerito.
 */
@Component({
  selector: 'app-admin',
  imports: [CommonModule, ReactiveFormsModule, IconComponent, PublishJourneyComponent, QRCodeComponent, JsonLdDrawerComponent, ScrollRevealDirective, ...HlmSelectImports],
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
  protected granularityLevels = GRANULARITY_LEVELS;

  protected view = signal<View>('checking');
  protected records = signal<DppRecord[]>([]);

  protected searchQuery = signal('');
  protected statusFilter = signal<'all' | 'draft' | 'published'>('all');
  protected statusFilters: { id: 'all' | 'draft' | 'published'; label: string }[] = [
    { id: 'all', label: 'Tutte' },
    { id: 'draft', label: 'Bozze' },
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
  protected dppForm = this.fb.nonNullable.group({
    sectorId: [SECTORS[0].id, Validators.required],
    name: ['', [Validators.required, Validators.minLength(2)]],
    gtin: ['', [Validators.required, gtinValidator()]],
    granularityLevel: ['ITEM' as GranularityLevel, Validators.required],
    batchOrSerial: ['', batchOrSerialValidator()],
    attributes: this.fb.array<FormGroup>([]),
  });
  /** L'intero valore del form come signal — la reattività di Angular Forms è basata su
   * Observable (valueChanges), qui ponte verso i signal usati dal resto del componente
   * (anteprima infografica, QR code, settore corrente). */
  protected formValue = toSignal(this.dppForm.valueChanges, { initialValue: this.dppForm.getRawValue() });

  protected formError = signal<string | null>(null);
  protected savePending = signal(false);
  protected publishPending = signal(false);
  protected publishedRecord = computed(() => this.records().find((r) => r.id === this.editingId() && r.status === 'published') ?? null);

  /** Il percorso animato verso il DPP Registry UE (vedi PublishJourneyComponent) — apparso al
   * click su "Pubblica", chiuso solo dall'utente una volta arrivato l'esito vero. */
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
  /** GTIN corrente, solo se valido — l'anteprima e il QR code mostrano un GTIN solo quando è
   * un UPI reale, non una stringa a metà digitazione. Controllo diretto con isValidGtin() (la
   * stessa funzione pura usata dal validatore reattivo) invece di leggere `control.valid`: un
   * computed() deve dipendere solo da signal veri, non da un getter imperativo del FormControl
   * che può aggiornarsi con un giro di reattività diverso da `formValue`. */
  protected previewGtin = computed(() => {
    const gtin = this.formValue().gtin;
    return gtin && isValidGtin(gtin) ? gtin : null;
  });
  /** L'UPI — Unique Product Identifier — che verrà davvero inviato al DPP Registry UE al
   * momento della pubblicazione: un URI GS1 Digital Link, non il GTIN da solo (che è solo
   * l'identificativo numerico da cui l'UPI si costruisce — vedi l'etichetta del campo GTIN
   * qui sopra). Stessa identica logica di registry-api/src/mockRegistryClient.ts#buildUpi,
   * duplicata qui solo per l'anteprima (due servizi separati, come il resto del contratto). */
  protected previewUpi = computed<string | null>(() => {
    const gtin = this.previewGtin();
    if (!gtin) return null;
    const base = `${this.siteOrigin.value}/01/${gtin}`;
    const f = this.formValue();
    if (f.granularityLevel === 'MODEL' || !f.batchOrSerial) return base;
    const value = f.batchOrSerial.replace(/^\(\d{2}\)\s*/, '').trim();
    if (!value) return base;
    const ai = /^\(21\)/.test(f.batchOrSerial) || f.granularityLevel === 'ITEM' ? '21' : '10';
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
    // Se stiamo modificando una scheda già salvata, usiamo i suoi valori reali (id, stato,
    // ultimo aggiornamento) invece di segnaposto — stessa idea di registry-api/src/jsonld.ts.
    const existing = this.records().find((r) => r.id === this.editingId());

    const doc: Record<string, unknown> = {
      '@context': {
        gs1: 'https://ref.gs1.org/voc/',
        schema: 'http://schema.org/',
        name: 'schema:name',
        gtin: 'gs1:gtin',
      },
      '@type': ['schema:Product', 'gs1:Product'],
      '@id': `${this.siteOrigin.value}/01/${gtin}`,
      // Nomi di campo e struttura allineati a FprEN 18223:2026 §4.1.2.1 (Tabella 1) — vedi il
      // commento in registry-api/src/jsonld.ts#dppToJsonLd per il dettaglio di ogni campo.
      digitalProductPassportId: existing ? `urn:uuid:${existing.id}` : 'urn:uuid:(assegnato al salvataggio)',
      uniqueProductIdentifier: this.previewUpi(),
      name: f.name || null,
      gtin,
      granularity: (f.granularityLevel ?? 'MODEL').toLowerCase(),
      dppSchemaVersion: 'FprEN18223:2026',
      dppStatus: existing?.status === 'published' ? 'active' : 'inactive',
      lastUpdate: existing?.updatedAt ?? new Date().toISOString(),
      economicOperatorId: 'gs1-italy-dpp-demo',
    };

    if (f.batchOrSerial) {
      const value = f.batchOrSerial.replace(/^\(\d{2}\)\s*/, '').trim();
      if (/^\(21\)/.test(f.batchOrSerial) || f.granularityLevel === 'ITEM') {
        doc['gs1:hasSerialNumber'] = value;
      } else {
        doc['gs1:hasBatchLotNumber'] = value;
      }
    }

    const attrs = (f.attributes as { key: string; value: string }[]).filter((row) => row.key?.trim());
    if (attrs.length) {
      doc['schema:additionalProperty'] = attrs.map((row) => ({
        '@type': 'schema:PropertyValue',
        name: row.key.trim(),
        value: row.value,
      }));
    }

    if (existing?.registryId) {
      // Nome allineato all'output di RegisterProductDPP (FprEN 18222 §5.2, Tabella 8): il DPP
      // Registry UE restituisce "registrationId", non "registryId" (nome solo nostro, interno).
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
    this.titleService.setTitle('Amministrazione DPP | GS1 DPP');
    this.metaService.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    this.loadRecords().subscribe({
      next: () => this.view.set('list'),
      error: (err: HttpErrorResponse) => this.view.set(err.status === 401 ? 'login' : 'list'),
    });

    // Il toast (vedi admin.html/.css) resta a posizione fissa sullo schermo: si vede sempre,
    // anche dopo aver scorso una form lunga — non basta più mostrare l'errore solo in cima alla
    // pagina, l'utente non è detto ci torni con lo sguardo. Si chiude da solo dopo un po' o col
    // pulsante di chiusura; ogni nuovo errore riparte da zero.
    effect((onCleanup) => {
      if (!this.formError()) return;
      const timer = setTimeout(() => this.formError.set(null), 6000);
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

  protected gtinSuggestion(): string | null {
    return (this.dppForm.controls.gtin.errors?.['gtinCheckDigit']?.suggestion as string | undefined) ?? null;
  }

  protected applyGtinSuggestion(): void {
    const suggestion = this.gtinSuggestion();
    if (suggestion) this.dppForm.controls.gtin.setValue(suggestion);
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

  protected startCreate(): void {
    this.editingId.set(null);
    this.dppForm.reset({ sectorId: SECTORS[0].id, name: '', gtin: '', granularityLevel: 'ITEM', batchOrSerial: '' });
    this.attributesArray.clear();
    this.formError.set(null);
    this.view.set('form');
  }

  protected startEdit(record: DppRecord): void {
    this.editingId.set(record.id);
    this.dppForm.reset({
      sectorId: record.sectorId,
      gtin: record.gtin,
      name: record.name,
      granularityLevel: record.granularityLevel,
      batchOrSerial: record.batchOrSerial ?? '',
    });
    this.attributesArray.clear();
    for (const [key, value] of Object.entries(record.attributes)) {
      this.attributesArray.push(this.attributeGroup(key, value));
    }
    this.formError.set(null);
    this.view.set('form');
  }

  protected cancelForm(): void {
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
      gtin: sector.exampleGtin,
      name: demo.name,
      granularityLevel: demo.granularityLevel,
      batchOrSerial: demo.batchOrSerial,
    });
    this.attributesArray.clear();
    for (const [key, value] of Object.entries(demo.attributes)) {
      this.attributesArray.push(this.attributeGroup(key, value));
    }
  }

  /** hlm-select emette `string | null | undefined` (nessuna selezione è uno stato valido per
   * il componente) — i nostri controlli sono invece sempre valorizzati (required, con un
   * default), da cui questo piccolo guard invece di un cast nel template. */
  protected onSectorChange(value: string | null | undefined): void {
    if (value) this.dppForm.controls.sectorId.setValue(value);
  }

  protected onGranularityChange(value: GranularityLevel | null | undefined): void {
    if (value) this.dppForm.controls.granularityLevel.setValue(value);
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
      attributes,
    };
  }

  protected saveDraft(): void {
    this.dppForm.markAllAsTouched();
    if (this.dppForm.invalid) return;
    this.formError.set(null);
    this.savePending.set(true);
    const input = this.buildInput();
    const id = this.editingId();
    const request = id ? this.api.update(id, input) : this.api.create(input);
    request.subscribe({
      next: (record) => {
        this.savePending.set(false);
        this.editingId.set(record.id);
        this.view.set('form');
        this.loadRecords().subscribe();
      },
      error: (err: HttpErrorResponse) => {
        this.savePending.set(false);
        this.formError.set(err.error?.error ?? 'Errore durante il salvataggio.');
      },
    });
  }

  protected publish(): void {
    const id = this.editingId();
    if (!id) return;
    this.formError.set(null);
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

  protected closeJourney(): void {
    this.journeyOpen.set(false);
  }

  protected deleteRecord(record: DppRecord): void {
    if (!confirm(`Eliminare la scheda "${record.name}"?`)) return;
    this.api.delete(record.id).subscribe({
      next: () => this.loadRecords().subscribe(),
      error: (err: HttpErrorResponse) => this.formError.set(err.error?.error ?? 'Errore durante l\'eliminazione.'),
    });
  }

  protected sectorName(sectorId: string): string {
    return this.sectors.find((s) => s.id === sectorId)?.name ?? sectorId;
  }

  /** hlm-select-value mostra di default il `value` grezzo (l'id di settore, es. "battery") —
   * itemToString gli dice come renderizzare invece l'etichetta leggibile. */
  protected sectorItemToString = (sectorId: string): string => this.sectorName(sectorId);
}
