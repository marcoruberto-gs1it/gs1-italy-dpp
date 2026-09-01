import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { Product, ProductService, discountPercent, formatEuro } from '../../services/product.service';
import { UiStateService } from '../../services/ui-state.service';
import { I18nService } from '../../services/i18n.service';
import { onImageError } from '../../utils/image-fallback';

// Unico settore mostrato per ora (vedi discussione branch "catalogo-smart"): il resto del
// catalogo tornerà una volta decisi i prodotti da includere.
const VISIBLE_SECTOR_ID = 'fmcg';

@Component({
  selector: 'app-home',
  imports: [CommonModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  protected uiState = inject(UiStateService);
  protected t = inject(I18nService).t;
  private productService = inject(ProductService);
  private titleService = inject(Title);
  private metaService = inject(Meta);

  protected onImageError = onImageError;
  protected discountPercent = discountPercent;
  protected formatEuro = formatEuro;

  products = computed<Product[]>(() => this.productService.getProductsBySector(VISIBLE_SECTOR_ID));

  constructor() {
    this.titleService.setTitle(this.t('hero.pageTitle'));
    this.metaService.updateTag({ name: 'description', content: this.t('hero.subtitle') });
  }
}
