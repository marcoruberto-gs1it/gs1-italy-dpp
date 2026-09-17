import { RenderMode, ServerRoute } from '@angular/ssr';
import productsData from './data/products.json';

const products = productsData as { gtin: string; brandOwner?: { gln: string } }[];

export const serverRoutes: ServerRoute[] = [
  {
    path: '01/:gtin',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return products.map((p) => ({ gtin: p.gtin }));
    }
  },
  {
    path: '414/:gln',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      // Un brand owner (GLN) può comparire su più prodotti (es. Barilla su più GTIN): la pagina
      // è una sola per GLN, quindi qui va deduplicato invece di prerenderizzare due volte la
      // stessa rotta.
      const glns = new Set(products.map((p) => p.brandOwner?.gln).filter((gln): gln is string => !!gln));
      return [...glns].map((gln) => ({ gln }));
    }
  },
  {
    // Sezione admin: dati privati dietro password, niente da prerenderizzare — vedi il
    // blocco `location /admin` in webshop/nginx.conf per il fallback su index.csr.html.
    path: 'admin',
    renderMode: RenderMode.Client
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
