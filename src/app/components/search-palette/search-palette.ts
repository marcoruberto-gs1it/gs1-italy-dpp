import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { Product, ProductService } from '../../services/product.service';
import { UiStateService } from '../../services/ui-state.service';
import { onImageError } from '../../utils/image-fallback';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-search-palette',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './search-palette.html',
  styleUrl: './search-palette.css',
})
export class SearchPaletteComponent {
  protected uiState = inject(UiStateService);
  private productService = inject(ProductService);
  private router = inject(Router);
  protected t = inject(I18nService).t;

  private inputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  query = signal('');
  activeIndex = signal(0);

  results = signal<Product[]>([]);
  protected onImageError = onImageError;

  constructor() {
    effect(() => {
      if (this.uiState.searchOpen()) {
        this.query.set('');
        this.results.set([]);
        this.activeIndex.set(0);
        queueMicrotask(() => this.inputRef()?.nativeElement.focus());
      }
    });
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing =
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    if (!this.uiState.searchOpen() && (event.key === '/' || (event.key === 'k' && (event.metaKey || event.ctrlKey))) && !typing) {
      event.preventDefault();
      this.uiState.openSearch();
      return;
    }

    if (this.uiState.searchOpen() && event.key === 'Escape') {
      this.close();
    }
  }

  onInput(value: string): void {
    this.query.set(value);
    this.results.set(value.trim() ? this.productService.search(value) : []);
    this.activeIndex.set(0);
  }

  onKeydown(event: KeyboardEvent): void {
    const list = this.results();
    if (!list.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.set((this.activeIndex() + 1) % list.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.set((this.activeIndex() - 1 + list.length) % list.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.select(list[this.activeIndex()]);
    }
  }

  select(product: Product): void {
    this.close();
    this.router.navigate(['/01', product.gtin]);
  }

  close(): void {
    this.uiState.closeSearch();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}
