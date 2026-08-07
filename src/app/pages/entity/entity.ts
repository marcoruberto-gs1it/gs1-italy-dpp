import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, effect, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { I18nService } from '../../services/i18n.service';
import { SiteOriginService } from '../../services/site-origin.service';
import { StructuredDataService } from '../../services/structured-data.service';
import { ProductService } from '../../services/product.service';
import { onImageError } from '../../utils/image-fallback';
import { BrandEntity, CertificationBodyEntity, getBrandEntities, getCertificationBodyEntities } from '../../data/entities';

type EntityKind = 'brand' | 'certificationBody';

const JSON_LD_ID = 'entity-structured-data';

@Component({
  selector: 'app-entity',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './entity.html',
  styleUrl: './entity.css',
})
export class EntityComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private productService = inject(ProductService);
  private titleService = inject(Title);
  private metaService = inject(Meta);
  private siteOrigin = inject(SiteOriginService);
  private structuredData = inject(StructuredDataService);
  protected t = inject(I18nService).t;
  protected onImageError = onImageError;

  private params = toSignal(this.route.paramMap);
  private data = toSignal(this.route.data);

  kind = computed<EntityKind>(() => (this.data()?.['kind'] as EntityKind) ?? 'brand');
  slug = computed(() => this.params()?.get('slug') || '');

  private allProducts = computed(() => this.productService.getAllProducts());

  private brandEntities = computed(() => getBrandEntities(this.allProducts()));
  private certificationBodyEntities = computed(() => getCertificationBodyEntities(this.allProducts()));

  entity = computed<BrandEntity | CertificationBodyEntity | undefined>(() =>
    this.kind() === 'brand'
      ? this.brandEntities().find((b) => b.slug === this.slug())
      : this.certificationBodyEntities().find((b) => b.slug === this.slug())
  );

  breadcrumbLabel = computed(() =>
    this.kind() === 'brand' ? this.t('entity.brandBreadcrumb') : this.t('entity.certificationBodyBreadcrumb')
  );

  typeBadge = computed(() =>
    this.kind() === 'brand' ? this.t('entity.brandBadge') : this.t('entity.certificationBodyBadge')
  );

  /**
   * Stesso @type/nome del nodo che generate-knowledge-graph.js scrive per questo stesso @id in
   * knowledge-graph.jsonld: chi dereferenzia l'identificatore riceve indietro una descrizione
   * coerente con quella pubblicata nel grafo, non una struttura parallela.
   */
  private jsonLd = computed(() => {
    const entity = this.entity();
    if (!entity) return null;
    const origin = this.siteOrigin.value.replace(/\/$/, '');
    const path = entity.kind === 'brand' ? 'brand' : 'certification-body';
    const id = `${origin}/id/${path}/${entity.slug}`;

    if (entity.kind === 'brand') {
      return {
        '@context': { schema: 'https://schema.org/', gs1: 'https://ref.gs1.org/voc/', '@vocab': 'https://schema.org/' },
        '@id': id,
        '@type': ['Brand', 'gs1:Brand'],
        name: entity.name,
        'gs1:brandName': [{ '@value': entity.name, '@language': 'it' }],
      };
    }
    return {
      '@context': { gs1: 'https://ref.gs1.org/voc/', gs1it: `${origin}/voc/` },
      '@id': id,
      '@type': 'gs1it:CertificationBody',
      'gs1:organizationName': [{ '@value': entity.name, '@language': 'it' }],
    };
  });

  constructor() {
    effect(() => this.structuredData.apply(JSON_LD_ID, this.jsonLd()));

    // Rotta riusata cambiando :slug: ngOnInit non verrebbe richiamato, serve un effect (stesso
    // motivo di sector.ts e vocabulary-term.ts).
    effect(() => {
      const entity = this.entity();
      this.titleService.setTitle(entity ? `${entity.name} | ${this.breadcrumbLabel()}` : this.t('entity.notFoundTitle'));
      this.metaService.updateTag({
        name: 'description',
        content: entity
          ? this.t(entity.kind === 'brand' ? 'entity.brandMetaDescription' : 'entity.certificationBodyMetaDescription', { name: entity.name })
          : this.t('entity.notFoundTitle'),
      });
    });
  }

  ngOnDestroy(): void {
    this.structuredData.remove(JSON_LD_ID);
  }
}
