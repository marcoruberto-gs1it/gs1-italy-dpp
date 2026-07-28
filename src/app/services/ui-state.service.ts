import { Injectable, signal } from '@angular/core';
import { Product } from './product.service';

/**
 * Stato UI condiviso tra header, palette di ricerca e drawer JSON-LD.
 */
@Injectable({ providedIn: 'root' })
export class UiStateService {
  searchOpen = signal<boolean>(false);
  jsonLdDrawer = signal<{ open: boolean; product: Product | null; tab: 'jsonld' | 'compare' }>({
    open: false,
    product: null,
    tab: 'jsonld',
  });

  openSearch(): void {
    this.searchOpen.set(true);
  }

  closeSearch(): void {
    this.searchOpen.set(false);
  }

  openJsonLd(product: Product, tab: 'jsonld' | 'compare' = 'jsonld'): void {
    this.jsonLdDrawer.set({ open: true, product, tab });
  }

  closeJsonLd(): void {
    this.jsonLdDrawer.update((s) => ({ ...s, open: false }));
  }
}
