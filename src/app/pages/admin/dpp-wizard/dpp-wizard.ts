import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, Signal, inject, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { IconComponent } from '../../../components/icon/icon';
import { ScrollRevealDirective } from '../../../directives/scroll-reveal';
import { Sector } from '../../../data/sectors';
import { GranularityLevel, RegistryApiService } from '../../../services/registry-api.service';
import { hasIncompleteAttributeRow, isValidBatchOrSerial, isValidGtin } from '../../../utils/gs1-validators';

/** Duplicato apposta di ToastSeverity in admin.ts, non importato — stesso motivo di
 * DppFormGroup qui sotto: admin.ts importa questo componente come valore, quindi il Wizard non
 * può importare nulla, nemmeno solo a livello di tipo, da admin.ts (riferimento circolare). */
export type ToastSeverity = 'error' | 'warning';

/** Stessa forma esatta di `dppForm` in admin.ts — ripetuta qui invece di importarne il tipo da
 * `Admin` per evitare un riferimento circolare tra i due file (Admin importa il componente
 * Wizard per usarlo nel proprio template, quindi il Wizard non può importare — nemmeno solo a
 * livello di tipo — da admin.ts). Se i campi di dppForm cambiano, questo tipo va aggiornato
 * insieme. */
export type DppFormGroup = FormGroup<{
  sectorId: FormControl<string>;
  name: FormControl<string>;
  gtin: FormControl<string>;
  granularityLevel: FormControl<GranularityLevel>;
  batchOrSerial: FormControl<string>;
  attributes: FormArray<FormGroup<{ key: FormControl<string>; value: FormControl<string> }>>;
}>;

const GRANULARITY_LEVELS: GranularityLevel[] = ['MODEL', 'BATCH', 'ITEM'];

interface WizardStep {
  title: string;
  /** Sottotitolo breve mostrato nell'indicatore di avanzamento. */
  short: string;
}

const STEPS: WizardStep[] = [
  { title: 'A quale settore appartiene il prodotto?', short: 'Settore' },
  { title: 'Come si identifica il prodotto?', short: 'Identificazione' },
  { title: 'A che livello serve il passaporto?', short: 'Granularità' },
  { title: 'Che dati di prodotto vuoi pubblicare?', short: 'Attributi' },
  { title: 'Riepilogo e pubblicazione', short: 'Riepilogo' },
];

/**
 * Modalità guidata per compilare una scheda DPP passo per passo, spiegando il significato di
 * ogni campo — alternativa al form a pagina singola (vedi admin.html, schermata di scelta
 * 'create-choice'), sugli stessi identici dati: questo componente non possiede nessuno stato
 * di form proprio, riceve `form`/`attributesArray` per riferimento da Admin (stesso FormGroup,
 * stessa istanza) e li manipola con `formControlName`/`[formGroup]` come farebbe il form
 * originale — ogni digitazione qui è immediatamente visibile anche nell'altra vista, e
 * viceversa, perché non c'è nessun secondo stato da tenere sincronizzato.
 *
 * Validazione: "Avanti" resta disabilitato finché i soli campi del passo corrente non sono
 * validi. Deliberatamente letta in modo imperativo (`form.getRawValue()`/controlli diretti) da
 * un metodo, non da un computed(): un computed() traccia solo le letture di signal veri, e
 * FormGroup/FormArray non lo sono — un computed che dipendesse da `.valid` rischierebbe la
 * stessa staleness già trovata e corretta altrove in questo modulo (vedi il commento su
 * `previewGtin` in admin.ts). Un metodo letto dal template, invece, viene rivalutato ad ogni
 * ciclo di change detection — che ReactiveFormsModule fa scattare da sé ad ogni input
 * dell'utente, anche in un'app senza zone.js come questa (vedi angular.json/app.config.ts).
 */
@Component({
  selector: 'app-dpp-wizard',
  imports: [CommonModule, ReactiveFormsModule, IconComponent, ScrollRevealDirective],
  templateUrl: './dpp-wizard.html',
  styleUrl: './dpp-wizard.css',
})
export class DppWizardComponent {
  /** Solo per leggere coldStartRetrying() nel pulsante "Salva bozza" (vedi dpp-wizard.html) —
   * un servizio singleton iniettabile direttamente, non un riferimento al componente Admin: non
   * ricrea il problema di riferimento circolare descritto sopra per DppFormGroup/ToastSeverity. */
  protected api = inject(RegistryApiService);

  @Input({ required: true }) form!: DppFormGroup;
  @Input({ required: true }) sectors!: Sector[];
  @Input({ required: true }) currentSector!: Signal<Sector>;
  @Input({ required: true }) previewGtin!: Signal<string | null>;
  @Input({ required: true }) previewUpi!: Signal<string | null>;
  @Input({ required: true }) previewJsonLd!: Signal<Record<string, unknown> | null>;
  @Input() gtinSuggestion: string | null = null;
  @Input({ required: true }) attributesArray!: FormArray<FormGroup>;
  @Input() savePending = false;

  @Output() applyGtinSuggestion = new EventEmitter<void>();
  @Output() addAttribute = new EventEmitter<void>();
  @Output() removeAttribute = new EventEmitter<number>();
  @Output() requestDemoFill = new EventEmitter<void>();
  @Output() requestFieldDemo = new EventEmitter<'name' | 'gtin' | 'granularityLevel' | 'batchOrSerial'>();
  @Output() showToast = new EventEmitter<{ message: string; severity: ToastSeverity }>();
  @Output() saveDraft = new EventEmitter<void>();
  @Output() switchToFullForm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  protected steps = STEPS;
  protected granularityLevels = GRANULARITY_LEVELS;
  protected currentStep = signal(0);
  protected lastReachedStep = signal(0);

  protected goTo(index: number): void {
    // Si può tornare indietro liberamente, ma si può saltare avanti solo fino al passo più
    // lontano già raggiunto validamente (niente scorciatoie verso passi mai sbloccati).
    if (index <= this.lastReachedStep()) this.currentStep.set(index);
  }

  /** A differenza di una volta, il pulsante "Avanti" resta sempre cliccabile (vedi
   * dpp-wizard.html): un pulsante disabilitato non spiega da sé perché non si può proseguire.
   * Qui invece, se il passo corrente non è valido, marchiamo i controlli come touched (così
   * fieldError() mostra il messaggio sotto al campo) ed emettiamo un toast — solo a questo
   * tentativo, mai ad ogni tasto premuto durante la digitazione. */
  protected next(): void {
    const step = this.currentStep();
    if (!this.isStepValid(step)) {
      this.markStepTouched(step);
      this.showToast.emit({ message: this.stepValidationMessage(step), severity: 'error' });
      return;
    }
    if (step === 3 && hasIncompleteAttributeRow(this.form.getRawValue().attributes as { key: string; value: string }[])) {
      // Non bloccante: una riga con solo la chiave o solo il valore viene semplicemente
      // ignorata al salvataggio (vedi Admin.buildInput()) — un avviso, non un errore.
      this.showToast.emit({ message: 'Un attributo ha solo il nome o solo il valore compilato: verrà ignorato al salvataggio.', severity: 'warning' });
    }
    const nextStep = Math.min(step + 1, this.steps.length - 1);
    this.currentStep.set(nextStep);
    this.lastReachedStep.set(Math.max(this.lastReachedStep(), nextStep));
  }

  private markStepTouched(index: number): void {
    switch (index) {
      case 1:
        this.form.controls.name.markAsTouched();
        this.form.controls.gtin.markAsTouched();
        break;
      case 2:
        this.form.controls.batchOrSerial.markAsTouched();
        break;
    }
  }

  private stepValidationMessage(index: number): string {
    switch (index) {
      case 1:
        return this.fieldError('name') ?? this.fieldError('gtin') ?? 'Controlla nome e GTIN prima di continuare.';
      case 2:
        return this.fieldError('batchOrSerial') ?? 'Controlla lotto/seriale prima di continuare.';
      default:
        return 'Controlla i campi di questo passo prima di continuare.';
    }
  }

  protected back(): void {
    this.currentStep.set(Math.max(this.currentStep() - 1, 0));
  }

  protected isStepValid(index: number): boolean {
    const f = this.form.getRawValue();
    switch (index) {
      case 0:
        return !!f.sectorId;
      case 1:
        return f.name.trim().length >= 2 && isValidGtin(f.gtin.trim());
      case 2:
        return isValidBatchOrSerial(f.batchOrSerial);
      default:
        return true;
    }
  }

  protected selectSector(sectorId: string): void {
    this.form.controls.sectorId.setValue(sectorId);
  }

  protected onGranularityChange(value: GranularityLevel | null | undefined): void {
    if (value) this.form.controls.granularityLevel.setValue(value);
  }

  /** Messaggio di errore leggibile per un campo — stessa logica di Admin.fieldError(), qui
   * self-contained per non dover passare un'altra funzione dal padre solo per questo. */
  protected fieldError(name: 'name' | 'gtin' | 'batchOrSerial'): string | null {
    const control = this.form.controls[name];
    if (!control.errors || !(control.dirty || control.touched)) return null;
    const firstError = Object.values(control.errors)[0] as { message?: string } | undefined;
    return firstError?.message ?? null;
  }

  protected granularityHelp(level: GranularityLevel): string {
    switch (level) {
      case 'MODEL':
        return 'Un solo passaporto per tutti gli esemplari di questo modello/versione di prodotto — non distingue lotti o pezzi singoli.';
      case 'BATCH':
        return 'Un passaporto per ogni lotto di produzione — utile quando le caratteristiche (es. materiali, provenienza) possono variare da un lotto all\'altro.';
      case 'ITEM':
        return "Un passaporto per ogni singolo esemplare, identificato da un numero seriale — necessario quando serve tracciare lo stato di un pezzo specifico nel tempo (es. batterie, dispositivi riparabili).";
    }
  }
}
