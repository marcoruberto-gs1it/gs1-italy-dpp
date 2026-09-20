import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, Signal, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { IconComponent } from '../../../components/icon/icon';
import { ScrollRevealDirective } from '../../../directives/scroll-reveal';
import { Sector } from '../../../data/sectors';
import { GranularityLevel } from '../../../services/registry-api.service';
import { isValidBatchOrSerial, isValidGtin } from '../../../utils/gs1-validators';

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
  imports: [CommonModule, ReactiveFormsModule, IconComponent, ScrollRevealDirective, ...HlmSelectImports],
  templateUrl: './dpp-wizard.html',
  styleUrl: './dpp-wizard.css',
})
export class DppWizardComponent {
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

  protected next(): void {
    if (!this.isStepValid(this.currentStep())) return;
    const nextStep = Math.min(this.currentStep() + 1, this.steps.length - 1);
    this.currentStep.set(nextStep);
    this.lastReachedStep.set(Math.max(this.lastReachedStep(), nextStep));
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
