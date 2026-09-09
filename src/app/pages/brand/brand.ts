import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ProductService, formatEuro, discountPercent } from '../../services/product.service';
import { JsonLdDrawerComponent } from '../../components/json-ld-drawer/json-ld-drawer';
import { IconComponent } from '../../components/icon/icon';
import { setSocialMeta } from '../../utils/social-meta';
import { onImageError } from '../../utils/image-fallback';
import { normalizeUrl } from '../../utils/url';
import { I18nService } from '../../services/i18n.service';
import { SiteOriginService } from '../../services/site-origin.service';
import { StructuredDataService } from '../../services/structured-data.service';

/**
 * Pagina del brand owner, risolvibile via GS1 Digital Link con Application Identifier 414
 * (Global Location Number) — stesso principio della scheda prodotto su /01/{gtin}, ma qui la
 * chiave primaria è il GLN dell'organizzazione invece del GTIN dell'articolo. Vedi
 * BrandOwner in product.service.ts per la provenienza dei dati (prefisso GS1 reale, verificato
 * via GEPIR; riferimento di sede dimostrativo).
 */
@Component({
  selector: 'app-brand',
  standalone: true,
  imports: [CommonModule, RouterLink, JsonLdDrawerComponent, IconComponent],
  templateUrl: './brand.html',
  styleUrl: './brand.css',
})
export class BrandComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private productService = inject(ProductService);
  private titleService = inject(Title);
  private metaService = inject(Meta);
  private siteOrigin = inject(SiteOriginService);
  private structuredData = inject(StructuredDataService);
  protected t = inject(I18nService).t;

  protected onImageError = onImageError;
  protected formatEuro = formatEuro;
  protected discountPercent = discountPercent;
  protected normalizeUrl = normalizeUrl;

  private routeParams = toSignal(this.route.paramMap);
  gln = computed(() => this.routeParams()?.get('gln') ?? null);

  owner = computed(() => {
    const gln = this.gln();
    return gln ? this.productService.getBrandOwnerByGln(gln) : undefined;
  });

  products = computed(() => {
    const gln = this.gln();
    return gln ? this.productService.getProductsByGln(gln) : [];
  });

  jsonLdJson = computed(() => {
    const owner = this.owner();
    const gln = this.gln();
    if (!owner || !gln) return null;
    const url = `${this.siteOrigin.value}/414/${gln}`;
    return {
      '@context': {
        gs1: 'https://ref.gs1.org/voc/',
        schema: 'http://schema.org/',
        name: 'schema:name',
        url: 'schema:url',
      },
      '@type': ['schema:Organization', 'gs1:Organization'],
      '@id': url,
      hasGS1DigitalLink: url,
      name: owner.companyName,
      'gs1:globalLocationNumber': gln,
      // rdf:langString (range dichiarato di gs1:organizationName): senza @language non è un
      // literal tipizzato correttamente, vedi lang() in add-gs1-jsonld.js per lo stesso motivo.
      'gs1:organizationName': { '@value': owner.companyName, '@language': 'it' },
      ...(owner.website ? { 'gs1:homepage': owner.website, url: normalizeUrl(owner.website) } : {}),
    };
  });

  // BreadcrumbList — stessa struttura del breadcrumb visibile in brand.html.
  breadcrumbJsonLd = computed(() => {
    const owner = this.owner();
    const gln = this.gln();
    if (!owner || !gln) return null;
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: this.t('nav.home'), item: this.siteOrigin.value },
        { '@type': 'ListItem', position: 2, name: owner.companyName, item: `${this.siteOrigin.value}/414/${gln}` },
      ],
    };
  });

  jsonLdDrawerOpen = signal(false);

  openJsonLd(): void {
    this.jsonLdDrawerOpen.set(true);
  }

  closeJsonLd(): void {
    this.jsonLdDrawerOpen.set(false);
  }

  constructor() {
    // Come in ProductComponent: la rotta è riusata cambiando :gln, serve un effect e non
    // ngOnInit perché titolo/meta/JSON-LD altrimenti resterebbero quelli del brand precedente.
    effect(() => {
      const owner = this.owner();
      const gln = this.gln();
      if (!owner || !gln) return;
      this.titleService.setTitle(`${owner.companyName} | ${this.t('hero.pageTitle')}`);
      const description = this.t('brand.metaDescription').replace('{company}', owner.companyName);
      this.metaService.updateTag({ name: 'description', content: description });
      setSocialMeta(this.metaService, {
        title: owner.companyName,
        description,
        url: `${this.siteOrigin.value}/414/${gln}`,
      });
    });

    effect(() => {
      this.structuredData.apply('brand-jsonld', this.jsonLdJson());
    });

    effect(() => {
      this.structuredData.apply('brand-breadcrumb-jsonld', this.breadcrumbJsonLd());
    });
  }

  ngOnDestroy(): void {
    this.structuredData.remove('brand-jsonld');
    this.structuredData.remove('brand-breadcrumb-jsonld');
  }
}
