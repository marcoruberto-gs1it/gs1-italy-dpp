import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output, computed, effect, signal } from '@angular/core';
import { IconComponent, IconName } from '../../../components/icon/icon';
import { DppRecord } from '../../../services/registry-api.service';

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
  { icon: 'save', title: 'Scheda salvata', standardTerm: 'Product data — presso l\'operatore economico' },
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
  protected steps = STEPS;
  protected eoId = DEMO_EO_ID;
  protected facilityId = DEMO_FACILITY_ID;

  private _open = signal(false);
  private _phase = signal<JourneyPhase>('running');
  private _record = signal<DppRecord | null>(null);
  private _errorMessage = signal<string | null>(null);
  private _registryId = signal<string | null>(null);

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
  @Output() closed = new EventEmitter<void>();

  private _longWait = signal(false);
  isLongWait = computed(() => this._longWait());

  isOpen = computed(() => this._open());
  activeRecord = computed(() => this._record());
  activeError = computed(() => this._errorMessage());
  activeRegistryId = computed(() => this._registryId());

  /** Passo fino a cui l'animazione "in corsa" è arrivata da sola (indipendente dalla vera
   * risposta di rete) — avanza da solo mentre `phase` resta 'running', poi si ferma al passo 2
   * (verifica) ad aspettare la risposta reale. */
  private staged = signal(0);
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    effect(() => {
      const isOpen = this._open();
      const phase = this._phase();
      this.clearTimers();
      if (!isOpen || phase !== 'running') {
        this.staged.set(phase === 'running' ? 0 : STEPS.length - 1);
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
    if (phase === 'error' && index === 2) return 'error';
    if (phase === 'success') return index <= 3 ? 'done' : 'pending';
    // running
    const staged = this.staged();
    if (index < staged) return 'done';
    if (index === staged) return 'active';
    return 'pending';
  }

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && this._phase() !== 'running') this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen() && this._phase() !== 'running') this.close();
  }
}
