import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { Product, ProductService, discountPercent, formatEuro } from '../../services/product.service';
import { UiStateService } from '../../services/ui-state.service';
import { I18nService } from '../../services/i18n.service';
import { onImageError } from '../../utils/image-fallback';
import { SiteOriginService } from '../../services/site-origin.service';
import { StructuredDataService } from '../../services/structured-data.service';
import { setSocialMeta } from '../../utils/social-meta';

// Unico settore mostrato per ora (vedi discussione branch "catalogo-smart"): il resto del
// catalogo tornerà una volta decisi i prodotti da includere.
const VISIBLE_SECTOR_ID = 'fmcg';

@Component({
  selector: 'app-home',
  imports: [CommonModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnDestroy {
  protected uiState = inject(UiStateService);
  protected t = inject(I18nService).t;
  private productService = inject(ProductService);
  private titleService = inject(Title);
  private metaService = inject(Meta);
  private siteOrigin = inject(SiteOriginService);
  private structuredData = inject(StructuredDataService);

  protected onImageError = onImageError;
  protected discountPercent = discountPercent;
  protected formatEuro = formatEuro;

  products = computed<Product[]>(() => this.productService.getProductsBySector(VISIBLE_SECTOR_ID));

  // Identità del sito come schema:WebSite — non presente altrove, e la home è l'unica pagina
  // dove ha senso pubblicarla una volta sola (le pagine prodotto/brand hanno già il proprio
  // schema:Product/Organization più specifico).
  websiteJsonLd = computed(() => ({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: this.t('hero.pageTitle'),
    url: this.siteOrigin.value,
  }));

  constructor() {
    // effect, non chiamata diretta nel costruttore: this.t() legge il segnale della lingua
    // corrente, quindi titolo/meta restano corretti anche se l'utente cambia lingua restando
    // sulla home, invece di restare quelli della lingua attiva al primo caricamento.
    effect(() => {
      const title = this.t('hero.pageTitle');
      const description = this.t('hero.subtitle');
      this.titleService.setTitle(title);
      this.metaService.updateTag({ name: 'description', content: description });
      setSocialMeta(this.metaService, { title, description, url: this.siteOrigin.value });
    });

    effect(() => {
      this.structuredData.apply('website-jsonld', this.websiteJsonLd());
    });
  }

  ngOnDestroy(): void {
    this.structuredData.remove('website-jsonld');
  }
}
