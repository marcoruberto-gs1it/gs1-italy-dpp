import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { tap } from 'rxjs';
import { IconComponent } from '../../components/icon/icon';
import { SECTORS, Sector } from '../../data/sectors';
import { DppInput, DppRecord, GranularityLevel, RegistryApiService } from '../../services/registry-api.service';
import { DEMO_DATA } from './demo-data';
import { JourneyPhase, PublishJourneyComponent } from './publish-journey/publish-journey';

type View = 'checking' | 'login' | 'list' | 'form';

interface AttributeRow {
  key: string;
  value: string;
}

const GRANULARITY_LEVELS: GranularityLevel[] = ['MODEL', 'BATCH', 'ITEM'];

const EMPTY_FORM = {
  sectorId: SECTORS[0].id,
  gtin: '',
  name: '',
  granularityLevel: 'ITEM' as GranularityLevel,
  batchOrSerial: '',
};

/**
 * Sezione admin per creare/modificare schede DPP e pubblicarle su mock-eu-registry
 * (il registro puntatori UE — vedi registry-api/src/mockRegistryClient.ts per il perché
 * dell'architettura). Non prerenderizzata: vedi RenderMode.Client in app.routes.server.ts.
 */
@Component({
  selector: 'app-admin',
  imports: [CommonModule, IconComponent, PublishJourneyComponent],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin {
  private api = inject(RegistryApiService);
  private titleService = inject(Title);
  private metaService = inject(Meta);

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

  protected loginPassword = signal('');
  protected loginError = signal<string | null>(null);
  protected loginPending = signal(false);

  protected editingId = signal<string | null>(null);
  protected form = signal({ ...EMPTY_FORM });
  protected attributeRows = signal<AttributeRow[]>([]);
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
  /** Il settore attualmente scelto nel form — pilota sia il pulsante dati demo sia l'anteprima
   * infografica del passaporto qui sotto. */
  protected currentSector = computed<Sector>(() => this.sectors.find((s) => s.id === this.form().sectorId) ?? this.sectors[0]);

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

  protected onLoginPasswordInput(event: Event): void {
    this.loginPassword.set((event.target as HTMLInputElement).value);
  }

  protected submitLogin(): void {
    this.loginError.set(null);
    this.loginPending.set(true);
    this.api.login(this.loginPassword()).subscribe({
      next: () => {
        this.loginPending.set(false);
        this.loginPassword.set('');
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
    this.form.set({ ...EMPTY_FORM });
    this.attributeRows.set([]);
    this.formError.set(null);
    this.view.set('form');
  }

  protected startEdit(record: DppRecord): void {
    this.editingId.set(record.id);
    this.form.set({
      sectorId: record.sectorId,
      gtin: record.gtin,
      name: record.name,
      granularityLevel: record.granularityLevel,
      batchOrSerial: record.batchOrSerial ?? '',
    });
    this.attributeRows.set(Object.entries(record.attributes).map(([key, value]) => ({ key, value })));
    this.formError.set(null);
    this.view.set('form');
  }

  protected cancelForm(): void {
    this.view.set('list');
  }

  /** Popola il form con dati fittizi plausibili per il settore attualmente selezionato — solo
   * per velocizzare la demo. Sovrascrive tutto, GTIN incluso: dopo un cambio di settore l'utente
   * si aspetta una scheda demo coerente col nuovo settore, non un GTIN rimasto del precedente. */
  protected fillDemoData(): void {
    const sector = this.currentSector();
    const demo = DEMO_DATA[sector.id];
    if (!demo) return;
    this.form.update((f) => ({
      ...f,
      gtin: sector.exampleGtin,
      name: demo.name,
      granularityLevel: demo.granularityLevel,
      batchOrSerial: demo.batchOrSerial,
    }));
    this.attributeRows.set(Object.entries(demo.attributes).map(([key, value]) => ({ key, value })));
  }

  protected updateField<K extends keyof typeof EMPTY_FORM>(field: K, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.form.update((f) => ({ ...f, [field]: value }));
  }

  protected addAttributeRow(): void {
    this.attributeRows.update((rows) => [...rows, { key: '', value: '' }]);
  }

  protected removeAttributeRow(index: number): void {
    this.attributeRows.update((rows) => rows.filter((_, i) => i !== index));
  }

  protected updateAttributeKey(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.attributeRows.update((rows) => rows.map((row, i) => (i === index ? { ...row, key: value } : row)));
  }

  protected updateAttributeValue(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.attributeRows.update((rows) => rows.map((row, i) => (i === index ? { ...row, value } : row)));
  }

  private buildInput(): DppInput {
    const f = this.form();
    const attributes: Record<string, string> = {};
    for (const row of this.attributeRows()) {
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
    this.journeyPhase.set('running');
    this.journeyOpen.set(true);

    this.api.publish(id).subscribe({
      next: (record) => {
        this.publishPending.set(false);
        this.journeyPhase.set('success');
        this.journeyRegistryId.set(record.registryId);
        this.loadRecords().subscribe();
      },
      error: (err: HttpErrorResponse) => {
        this.publishPending.set(false);
        this.journeyPhase.set('error');
        this.journeyError.set(err.error?.error ?? 'Errore durante la pubblicazione.');
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
}
