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
   * (verifica) ad aspettare la risposta reale. */
  private staged = signal(0);
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    // Nessun bisogno di un modo per "uscire" da qui: la barra di navigazione del Wizard
    // (Indietro/Torna all'elenco, sempre in cima) resta cliccabile anche mentre questo passo è
    // aperto — a differenza di quando questo componente era un pannello sovrapposto, non c'è più
    // nulla da nascondere esplicitamente.
    effect(() => {
      const phase = this._phase();
      this.clearTimers();
      if (phase !== 'running') {
        this.staged.set(STEPS.length - 1);
        return;
      }
      this.staged.set(0);
      this.timers.push(setTimeout(() => this.staged.set(1), 350));
      this.timers.push(setTimeout(() => this.staged.set(2), 1100));
      // Il passo 3 (registrazione confermata) lo sblocca solo l'arrivo vero della risposta
      // (vedi stepStatus): qui l'animazione coreografata si ferma di proposito.
    });
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  stepStatus(index: number): StepStatus {
    const phase = this._phase();
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
    const phase = this._phase();
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
