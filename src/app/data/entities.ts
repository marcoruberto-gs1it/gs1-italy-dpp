import type { Product } from '../services/product.service';

// Stesso identico algoritmo di generate-knowledge-graph.js::slugify (Node), riportato qui perché
// serve anche lato Angular (pagina /id/certification-body/:slug e il suo prerendering) — gli
// organismi di certificazione non hanno un @id salvato in products.json, solo il nome, quindi lo
// slug va ricalcolato con la stessa regola in entrambi i posti perché coincidano.
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pickIt(values: Array<{ '@value': string; '@language'?: string }> | undefined): string | undefined {
  return values?.find((v) => v['@language'] === 'it')?.['@value'] ?? values?.[0]?.['@value'];
}

// Ultimo segmento del path di un @id già coniato (es. ".../id/brand/gs1-italy-sapori" →
// "gs1-italy-sapori"), qualunque sia il dominio davanti — placeholder di build o origine reale.
function slugFromId(id: string): string {
  const trimmed = id.replace(/\/+$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

export interface EntityProductRef {
  gtin: string;
  name: string;
  image: string;
}

export interface BrandEntity {
  kind: 'brand';
  slug: string;
  name: string;
  products: EntityProductRef[];
}

export interface CertificationBodyEntity {
  kind: 'certificationBody';
  slug: string;
  name: string;
  products: (EntityProductRef & { standard?: string; value?: string })[];
}

/** Un nodo per brand, derivato da rawGs1Data.brand['@id'] — lo stesso @id letto (non coniato) da generate-knowledge-graph.js. */
export function getBrandEntities(products: Product[]): BrandEntity[] {
  const bySlug = new Map<string, BrandEntity>();
  for (const p of products) {
    const brand = p.rawGs1Data?.brand;
    const id: string | undefined = brand?.['@id'];
    if (!id) continue;
    const slug = slugFromId(id);
    const name = pickIt(brand['gs1:brandName']) ?? brand.name ?? p.brand;
    if (!bySlug.has(slug)) bySlug.set(slug, { kind: 'brand', slug, name, products: [] });
    bySlug.get(slug)!.products.push({ gtin: p.gtin, name: p.name, image: p.image });
  }
  return [...bySlug.values()];
}

/**
 * Un nodo per organismo di certificazione, derivato da gs1:certificationAgency (testo, come da
 * range dichiarato nel Web Vocabulary): a differenza del brand, qui non c'è un @id da leggere in
 * products.json, quindi lo slug è ricalcolato dal nome — stessa regola di
 * generate-knowledge-graph.js::certificationBodyId.
 */
export function getCertificationBodyEntities(products: Product[]): CertificationBodyEntity[] {
  const bySlug = new Map<string, CertificationBodyEntity>();
  for (const p of products) {
    const certs = p.rawGs1Data?.['gs1:certification'];
    if (!Array.isArray(certs)) continue;
    for (const cert of certs) {
      const name = pickIt(cert['gs1:certificationAgency']);
      if (!name) continue;
      const slug = slugify(name);
      if (!bySlug.has(slug)) bySlug.set(slug, { kind: 'certificationBody', slug, name, products: [] });
      bySlug.get(slug)!.products.push({
        gtin: p.gtin,
        name: p.name,
        image: p.image,
        standard: pickIt(cert['gs1:certificationStandard']),
        value: pickIt(cert['gs1:certificationValue']),
      });
    }
  }
  return [...bySlug.values()];
}
