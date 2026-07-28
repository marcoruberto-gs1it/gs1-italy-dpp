import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { UiStateService } from '../../services/ui-state.service';
import { getVocabularies } from '../../services/product.service';
import { onImageError } from '../../utils/image-fallback';
import { highlightJson } from '../../utils/json-highlight';
import { I18nService } from '../../services/i18n.service';

type DrawerTab = 'jsonld' | 'compare';

@Component({
  selector: 'app-json-ld-drawer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './json-ld-drawer.html',
  styleUrl: './json-ld-drawer.css',
})
export class JsonLdDrawerComponent {
  protected uiState = inject(UiStateService);
  private sanitizer = inject(DomSanitizer);
  protected t = inject(I18nService).t;

  tab = signal<DrawerTab>('jsonld');
  copied = signal(false);
  protected onImageError = onImageError;

  product = computed(() => this.uiState.jsonLdDrawer().product);
  isOpen = computed(() => this.uiState.jsonLdDrawer().open);

  constructor() {
    effect(() => {
      if (this.uiState.jsonLdDrawer().open) {
        this.tab.set(this.uiState.jsonLdDrawer().tab);
      }
    });
  }

  rawJson = computed(() => {
    const prod = this.product();
    if (!prod?.rawGs1Data) return '';
    return JSON.stringify(prod.rawGs1Data, null, 2);
  });

  highlightedJson = computed<SafeHtml>(() => {
    return this.sanitizer.bypassSecurityTrustHtml(highlightJson(this.rawJson()));
  });

  vocabularies = computed(() => {
    const prod = this.product();
    return prod ? getVocabularies(prod) : [];
  });

  vocabLabel = computed(() => {
    const vocabs = this.vocabularies();
    const hasGs1 = vocabs.includes('gs1');
    const hasSchema = vocabs.includes('schema');
    if (hasGs1 && hasSchema) return 'GS1 Web Vocabulary + schema.org';
    if (hasGs1) return 'GS1 Web Vocabulary';
    if (hasSchema) return 'schema.org';
    return 'JSON-LD';
  });

  /** Estrae nome/marchio/GTIN/tipo dal JSON-LD indipendentemente dalla forma (gs1:Offer, schema.org o mix). */
  compareFields = computed(() => {
    const prod = this.product();
    const raw = prod?.rawGs1Data;
    const itemOffered = raw?.itemOffered;

    const gs1Name = this.firstValue(itemOffered?.productName);
    const gs1Brand = this.firstValue(itemOffered?.brand?.brandName);

    const rawBrand = raw?.brand;
    const schemaBrand = typeof rawBrand === 'string' ? rawBrand : rawBrand?.name;

    const type = itemOffered?.['@type'] ?? raw?.['@type'];

    return {
      name: gs1Name !== '—' ? gs1Name : raw?.name ?? prod?.name ?? '—',
      brand: gs1Brand !== '—' ? gs1Brand : schemaBrand ?? prod?.brand ?? '—',
      gtin: itemOffered?.gtin ?? raw?.gtin13 ?? raw?.gtin ?? prod?.gtin ?? '—',
      type: Array.isArray(type) ? type.join(', ') : type ?? 'Product',
    };
  });

  setTab(tab: DrawerTab): void {
    this.tab.set(tab);
  }

  close(): void {
    this.uiState.closeJsonLd();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen()) this.close();
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.rawJson());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  firstValue(field: any): string {
    if (!field) return '—';
    if (Array.isArray(field)) return field[0]?.['@value'] ?? '—';
    return field['@value'] ?? field ?? '—';
  }
}
