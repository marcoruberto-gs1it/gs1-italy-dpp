import { Injectable, signal } from '@angular/core';
import { Product } from './product.service';

/**
 * Stato UI condiviso tra header e drawer JSON-LD.
 */
@Injectable({ providedIn: 'root' })
export class UiStateService {
  jsonLdDrawer = signal<{ open: boolean; product: Product | null; tab: 'jsonld' | 'compare' }>({
    open: false,
    product: null,
    tab: 'jsonld',
  });

  openJsonLd(product: Product, tab: 'jsonld' | 'compare' = 'jsonld'): void {
    this.jsonLdDrawer.set({ open: true, product, tab });
  }

  closeJsonLd(): void {
    this.jsonLdDrawer.update((s) => ({ ...s, open: false }));
  }
}
