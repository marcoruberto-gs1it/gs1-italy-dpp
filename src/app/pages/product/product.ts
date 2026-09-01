import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ProductService, productImages, discountPercent, formatEuro } from '../../services/product.service';
import { StarRatingComponent } from '../../components/star-rating/star-rating';
import { onImageError } from '../../utils/image-fallback';
import { I18nService } from '../../services/i18n.service';
import { SiteOriginService } from '../../services/site-origin.service';

@Component({
  selector: 'app-product',
  standalone: true,
  imports: [CommonModule, RouterLink, StarRatingComponent],
  templateUrl: './product.html',
  styleUrl: './product.css',
})
export class ProductComponent {
  private route = inject(ActivatedRoute);
  private productService = inject(ProductService);
  private titleService = inject(Title);
  private metaService = inject(Meta);
  private siteOrigin = inject(SiteOriginService);
  protected t = inject(I18nService).t;

  protected onImageError = onImageError;
  protected discountPercent = discountPercent;
  protected formatEuro = formatEuro;

  // toSignal (non uno snapshot letto una volta): Angular riusa la stessa istanza di
  // ProductComponent quando si naviga da un prodotto a un altro (stessa rotta, parametro
  // diverso), quindi senza reattività sui parametri di rotta la pagina resterebbe quella del
  // prodotto precedente.
  private routeParams = toSignal(this.route.paramMap);
  gtin = computed(() => this.routeParams()?.get('gtin') ?? null);

  activeImageIndex = signal(0);

  product = computed(() => {
    const gtin = this.gtin();
    return gtin ? this.productService.getProductByGtin(gtin) : undefined;
  });

  images = computed<string[]>(() => {
    const prod = this.product();
    return prod ? productImages(prod) : [];
  });

  activeImage = computed(() => this.images()[this.activeImageIndex()] ?? '');

  setActiveImage(index: number): void {
    this.activeImageIndex.set(index);
  }

  private absoluteUrl(url: string): string {
    if (!url || /^https?:\/\//i.test(url)) return url;
    return `${this.siteOrigin.value.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
  }

  constructor() {
    // Rotta riusata cambiando :gtin (navigazione da un prodotto all'altro): serve un effect,
    // non ngOnInit, altrimenti titolo/meta resterebbero quelli del prodotto precedente.
    effect(() => {
      const prod = this.product();
      this.activeImageIndex.set(0);
      if (!prod) return;
      this.titleService.setTitle(`${prod.name} | ${this.t('hero.pageTitle')}`);
      this.metaService.updateTag({ name: 'description', content: prod.description });
      this.metaService.updateTag({ property: 'og:title', content: prod.name });
      // og:image richiede un URL assoluto per specifica: chi lo consuma (anteprime social,
      // crawler) legge il tag fuori dal contesto della pagina.
      this.metaService.updateTag({ property: 'og:image', content: this.absoluteUrl(prod.image) });
    });
  }
}
