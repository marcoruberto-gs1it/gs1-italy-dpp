import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output, computed, effect, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { IconComponent, IconName } from '../../../components/icon/icon';
import { DppRecord, PublishTechnicalTrace } from '../../../services/registry-api.service';
import { highlightJson } from '../../../utils/json-highlight';

export type JourneyPhase = 'running' | 'success' | 'error';

type StepStatus = 'done' | 'active' | 'pending' | 'error';

interface JourneyStep {
  icon: IconName;
  title: string;
  /** Termine tecnico CEN/CENELEC o del registro, mostrato come sottotitolo — vedi
   * EN 18219 (identificativi) e CIRPASS-2/mock-eu-registry per i nomi di campo reali. */
  standardTerm: string;
}

/** Stessi identificativi demo hardcoded in registry-api/src/mockRegistryClient.ts — duplicati
 * qui solo per mostrarli nell'animazione, non letti da lì (due servizi separati, come il resto
 * del contratto DppRecord). */
const DEMO_EO_ID = 'gs1-italy-dpp-demo';
const DEMO_FACILITY_ID = 'gs1-italy-dpp-demo-facility';

const STEPS: JourneyStep[] = [
  { icon: 'save', title: 'DPP salvato', standardTerm: 'Product data — presso l\'operatore economico' },
  { icon: 'send', title: 'Invio identificativi al Registro UE', standardTerm: 'UPI · EO (UOI) · Facility (UFI) · Granularity level' },
  { icon: 'link', title: 'Verifica del Digital Link', standardTerm: 'Risoluzione liveURL — calcolo hash del contenuto' },
  { icon: 'check-circle', title: 'Registrazione confermata', standardTerm: 'Registry ID assegnato dal DPP Registry' },
];

/**
 * Visualizza il percorso reale di una pubblicazione: la scheda resta presso di noi (Product
 * data decentralizzato, vedi la sezione "Cos'è il DPP" in home.ts), solo gli identificativi e
 * l'hash del Digital Link viaggiano verso il Registro UE — è il punto che la home spiega in
 * teoria e questa animazione mostra in pratica, sulla scheda che si sta davvero pubblicando.
 *
 * I passi 1-2 sono quasi istantanei (costruiamo e inviamo la richiesta), il passo 3 resta in
 * corso finché non arriva davvero la risposta di registry-api — non è coreografia finta:
 * l'attesa qui è l'attesa di rete reale.
 */
@Component({
  selector: 'app-publish-journey',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './publish-journey.html',
  styleUrl: './publish-journey.css',
})
export class PublishJourneyComponent {
  private sanitizer = inject(DomSanitizer);

  protected steps = STEPS;
  protected eoId = DEMO_EO_ID;
  protected facilityId = DEMO_FACILITY_ID;

  private _open = signal(false);
  private _phase = signal<JourneyPhase>('running');
  private _record = signal<DppRecord | null>(null);
  private _errorMessage = signal<string | null>(null);
  private _registryId = signal<string | null>(null);
  private _technical = signal<PublishTechnicalTrace | null>(null);
  private _liveUrlJsonLd = signal<Record<string, unknown> | null>(null);

  @Input() set open(v: boolean) {
    this._open.set(!!v);
  }
  @Input() set phase(v: JourneyPhase) {
    this._phase.set(v);
  }
  @Input() set record(v: DppRecord | null) {
    this._record.set(v);
  }
  @Input() set errorMessage(v: string | null) {
    this._errorMessage.set(v ?? null);
  }
  @Input() set registryId(v: string | null) {
    this._registryId.set(v ?? null);
  }
  @Input() set longWait(v: boolean) {
    this._longWait.set(!!v);
  }
  @Input() set technical(v: PublishTechnicalTrace | null) {
    this._technical.set(v ?? null);
  }
  @Input() set liveUrlJsonLd(v: Record<string, unknown> | null) {
    this._liveUrlJsonLd.set(v ?? null);
  }
  @Output() closed = new EventEmitter<void>();

  private _longWait = signal(false);
  isLongWait = computed(() => this._longWait());

  isOpen = computed(() => this._open());
  activeRecord = computed(() => this._record());
  activeError = computed(() => this._errorMessage());
  activeRegistryId = computed(() => this._registryId());

  /** true solo quando l'utente ha aperto la vista tecnica per questo passaggio — richiusa da
   * sola quando la pubblicazione riparte (constructor). */
  protected technicalOpen = signal<Record<number, boolean>>({});

  protected toggleTechnical(stepIndex: number): void {
    this.technicalOpen.update((state) => ({ ...state, [stepIndex]: !state[stepIndex] }));
  }

  private highlight(data: unknown): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(highlightJson(JSON.stringify(data, null, 2)));
  }

  /** Passo 0 — "Scheda salvata": il record così com'è presso di noi, prima che qualunque dato
   * lasci il sistema. */
  protected localRecordJson = computed<SafeHtml | null>(() => {
    const record = this._record();
    return record ? this.highlight(record) : null;
  });

  /** Passo 1 — il payload REALE inviato a mock-eu-registry (non ricostruito: sono gli stessi
   * byte che registry-api ha davvero spedito, vedi mockRegistryClient.ts). */
  protected requestJson = computed<SafeHtml | null>(() => {
    const technical = this._technical();
    return technical ? this.highlight(technical.request) : null;
  });

  /** Passo 2 — il JSON-LD che mock-eu-registry scarica dal liveURL per calcolarne l'hash
   * (stessa risorsa che risolve pubblicamente su /01/{gtin}, vedi jsonld.ts). */
  protected liveUrlJson = computed<SafeHtml | null>(() => {
    const doc = this._liveUrlJsonLd();
    return doc ? this.highlight(doc) : null;
  });

  /** Passo 3 — la risposta REALE ricevuta da mock-eu-registry. */
  protected responseJson = computed<SafeHtml | null>(() => {
    const technical = this._technical();
    return technical ? this.highlight(technical.response) : null;
  });

  /** Passo fino a cui l'animazione "in corsa" è arrivata da sola (indipendente dalla vera
   * risposta di rete) — avanza da solo mentre `phase` resta 'running', poi si ferma al passo 2
   * (verifica) ad aspettare la risposta reale. */
  private staged = signal(0);
  private timers: ReturnType<typeof setTimeout>[] = [];

  /** true 20s dopo l'apertura del percorso se `phase` è ancora 'running' — indipendente da
   * `_longWait` (che segue i tentativi automatici e può scattare molto più tardi: con i timeout
   * lato server/client aggiunti in mockRegistryClient.ts/registry-api.service.ts, un primo
   * tentativo davvero bloccato può restare "in corso" fino a 90-150s prima di produrre anche
   * solo il primo errore che fa scattare un retry). Questo timer parte da solo all'apertura,
   * niente a che vedere con quanti tentativi sono già avvenuti: garantisce che l'utente abbia
   * comunque un modo di uscire entro un tempo breve e prevedibile, qualunque cosa stia
   * succedendo sotto. */
  private _canCancel = signal(false);
  protected canCancel = computed(() => this._canCancel());

  constructor() {
    effect(() => {
      const isOpen = this._open();
      const phase = this._phase();
      this.clearTimers();
      if (!isOpen || phase !== 'running') {
        this.staged.set(phase === 'running' ? 0 : STEPS.length - 1);
        this._canCancel.set(false);
        return;
      }
      this.staged.set(0);
      this._canCancel.set(false);
      this.technicalOpen.set({});
      this.timers.push(setTimeout(() => this.staged.set(1), 350));
      this.timers.push(setTimeout(() => this.staged.set(2), 1100));
      // Il passo 3 (registrazione confermata) lo sblocca solo l'arrivo vero della risposta
      // (vedi stepStatus): qui l'animazione coreografata si ferma di proposito.
      this.timers.push(setTimeout(() => this._canCancel.set(true), 20_000));
    });
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  stepStatus(index: number): StepStatus {
    const phase = this._phase();
    if (phase === 'error' && index === 2) return 'error';
    if (phase === 'success') return index <= 3 ? 'done' : 'pending';
    // running
    const staged = this.staged();
    if (index < staged) return 'done';
    if (index === staged) return 'active';
    return 'pending';
  }

  /** Chiudibile sempre, tranne nei primi 20s di un tentativo genuinamente "in corso" — lì la
   * chiusura è bloccata apposta per non far pensare a un annullamento che questa UI non fa
   * davvero (la richiesta prosegue comunque in background). Oltre i 20s (vedi `canCancel` sopra)
   * l'attesa non è più "normale": l'utente deve poter uscire anche senza un esito, invece di
   * restare bloccato per sempre se una chiamata esterna non risponde mai (vedi i timeout
   * aggiunti in mockRegistryClient.ts/registry-api.service.ts — dovrebbero già evitarlo, questa
   * è la rete di sicurezza in più). */
  private canClose(): boolean {
    return this._phase() !== 'running' || this._canCancel();
  }

  close(): void {
    if (this.canClose()) this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen()) this.close();
  }
}
