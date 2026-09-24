import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, computed, effect, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { IconComponent, IconName } from '../../../components/icon/icon';
import { DppRecord, PublishTechnicalTrace } from '../../../services/registry-api.service';
import { highlightJson } from '../../../utils/json-highlight';

export type JourneyPhase = 'running' | 'success' | 'error';

type StepStatus = 'done' | 'active' | 'pending' | 'error';

interface JourneyStep {
  icon: IconName;
  title: string;
  /** Termine tecnico mostrato come sottotitolo — vedi CIRPASS-2/mock-eu-registry per i nomi di
   * campo reali. */
  standardTerm: string;
}

const STEPS: JourneyStep[] = [
  { icon: 'save', title: 'Salvato nei sistemi aziendali', standardTerm: 'Product data — presso l\'operatore economico' },
  { icon: 'send', title: 'Invio identificativi al Registro UE', standardTerm: 'UPI · EO · Facility · livello di granularità' },
  { icon: 'link', title: 'Verifica del Digital Link', standardTerm: 'Risoluzione liveURL — calcolo hash del contenuto' },
  { icon: 'check-circle', title: 'Registrazione confermata', standardTerm: 'Registry ID assegnato dal DPP Registry' },
];

/**
 * Mostra il percorso reale di una pubblicazione — incorporato nel passo "Registrazione" del
 * Wizard (dpp-wizard.html), non più un blocco a parte che compare sotto pagina dopo un click su
 * "Pubblica": il DPP viene prima salvato nei sistemi aziendali — presso l'operatore economico,
 * dato che resta decentralizzato (vedi la sezione "Cos'è il DPP" in home.ts) — e solo dopo i suoi
 * identificativi e l'hash del Digital Link vengono inviati per la registrazione al Registro UE.
 * È il punto che la home spiega in teoria e questo percorso mostra in pratica, con il JSON reale
 * del passo attivo visibile a lato (colonna destra del passo, vedi dpp-wizard.html), non dietro
 * un click.
 *
 * I dati (JSON di ogni passo, esito, registryId) sono sempre reali, mai inventati — ma la loro
 * COMPARSA è volutamente ritardata rispetto al momento in cui arrivano davvero (vedi
 * MIN_REVEAL_MS sotto): in sviluppo/demo la chiamata reale può concludersi in pochi millisecondi,
 * il che farebbe "sparire" l'intera animazione prima che l'utente riesca a leggere anche solo il
 * primo passo. displayPhase, non `phase`, è quello che il template legge davvero.
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

  private _phase = signal<JourneyPhase>('running');
  private _record = signal<DppRecord | null>(null);
  private _errorMessage = signal<string | null>(null);
  private _registryId = signal<string | null>(null);
  private _technical = signal<PublishTechnicalTrace | null>(null);
  private _liveUrlJsonLd = signal<Record<string, unknown> | null>(null);

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

  private _longWait = signal(false);
  isLongWait = computed(() => this._longWait());

  activeRecord = computed(() => this._record());
  activeError = computed(() => this._errorMessage());
  activeRegistryId = computed(() => this._registryId());

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
   * (verifica) ad aspettare la rivelazione dell'esito vero (vedi displayPhase sotto). */
  private staged = signal(0);
  private timers: ReturnType<typeof setTimeout>[] = [];
  private revealTimer: ReturnType<typeof setTimeout> | null = null;
  private startedAt = 0;

  /** Quanto restano visibili i passi 1 e 2 prima di passare al successivo — tempo di lettura
   * minimo, non la durata reale della chiamata (quella può finire molto prima). */
  private readonly STAGE_1_MS = 900;
  private readonly STAGE_2_MS = 2200;
  /** Tempo minimo dall'inizio del percorso prima di rivelare l'esito vero (successo o errore) —
   * garantisce che l'utente faccia in tempo a leggere ogni passo anche quando l'API risponde in
   * una frazione di secondo (frequente in sviluppo/demo): senza questo minimo, un servizio
   * veloce faceva "saltare" l'intera animazione da "in corso" a "fatto" in pochi millisecondi,
   * mai realmente visibile. */
  private readonly MIN_REVEAL_MS = 4200;

  /** L'esito che l'interfaccia MOSTRA — distinto da `_phase()` (l'esito VERO, che arriva da
   * admin.ts non appena registry-api risponde): i due possono divergere per qualche secondo di
   * proposito, vedi MIN_REVEAL_MS sopra. */
  protected displayPhase = signal<JourneyPhase>('running');

  constructor() {
    // Nessun bisogno di un modo per "uscire" da qui: la barra di navigazione del Wizard
    // (Indietro/Torna all'elenco, sempre in cima) resta cliccabile anche mentre questo passo è
    // aperto — a differenza di quando questo componente era un pannello sovrapposto, non c'è più
    // nulla da nascondere esplicitamente.
    effect(() => {
      const phase = this._phase();
      if (phase === 'running') {
        // Nuovo tentativo (o primo): riparte tutto da zero, timer di lettura inclusi.
        this.clearTimers();
        this.startedAt = Date.now();
        this.displayPhase.set('running');
        this.staged.set(0);
        this.timers.push(setTimeout(() => this.staged.set(1), this.STAGE_1_MS));
        this.timers.push(setTimeout(() => this.staged.set(2), this.STAGE_2_MS));
        return;
      }
      // Esito vero arrivato: NON tocca i timer già pianificati sopra, che proseguono la propria
      // animazione di lettura indipendentemente — si limita a pianificare la rivelazione
      // dell'esito non prima del tempo minimo dall'inizio.
      if (this.revealTimer) return;
      const elapsed = Date.now() - this.startedAt;
      const delay = Math.max(0, this.MIN_REVEAL_MS - elapsed);
      this.revealTimer = setTimeout(() => {
        this.staged.set(STEPS.length - 1);
        this.displayPhase.set(phase);
        this.revealTimer = null;
      }, delay);
    });
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.revealTimer) {
      clearTimeout(this.revealTimer);
      this.revealTimer = null;
    }
  }

  stepStatus(index: number): StepStatus {
    const phase = this.displayPhase();
    if (phase === 'error') {
      // Il passo 2 (verifica) è quello che fallisce sempre — 0-1 erano già completati prima
      // dell'errore, il passo 3 (registrazione) non è mai stato raggiunto: prima restava
      // segnato "in corso" (animazione attiva a tempo indeterminato) anche a errore ormai
      // mostrato, un residuo dello stato 'running' che qui non si applica più.
      if (index < 2) return 'done';
      if (index === 2) return 'error';
      return 'pending';
    }
    if (phase === 'success') return index <= 3 ? 'done' : 'pending';
    // running
    const staged = this.staged();
    if (index < staged) return 'done';
    if (index === staged) return 'active';
    return 'pending';
  }

  /** Percentuale di avanzamento per la barra sottile in cima al percorso e per il flusso
   * compatto A→B→C→D — puramente decorativa (l'unica fonte di verità resta stepStatus/phase),
   * ricalcolata dagli stessi segnali così resta sempre coerente con i nodi sotto. */
  protected progressPercent = computed(() => {
    let done = 0;
    for (let i = 0; i < STEPS.length; i++) {
      if (this.stepStatus(i) === 'done') done++;
    }
    return Math.round((done / STEPS.length) * 100);
  });

  /** Il JSON del passo attivo (o, a percorso concluso, dell'ultimo raggiunto) — un solo pannello
   * a destra nel layout del Wizard, non più quattro blocchi impilati uno per riga: cambia da solo
   * mentre l'animazione avanza. */
  protected activeStepJson = computed<SafeHtml | null>(() => {
    const phase = this.displayPhase();
    const index = phase === 'running' ? this.staged() : phase === 'error' ? 2 : 3;
    switch (index) {
      case 0:
        return this.localRecordJson();
      case 1:
        return this.requestJson();
      case 2:
        return this.liveUrlJson();
      default:
        return this.responseJson();
    }
  });
}
