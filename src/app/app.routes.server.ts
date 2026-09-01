import { RenderMode, ServerRoute } from '@angular/ssr';
import productsData from './data/products.json';

const products = productsData as { gtin: string }[];

export const serverRoutes: ServerRoute[] = [
  {
    path: '01/:gtin',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return products.map((p) => ({ gtin: p.gtin }));
    }
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
