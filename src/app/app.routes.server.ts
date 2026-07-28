import { RenderMode, ServerRoute } from '@angular/ssr';
import productsData from './data/products.json';

const products = productsData as { gtin: string; sectorId: string; traceabilityExample?: { lot: string; serial: string } }[];
const sectorIds = [...new Set(products.map((p) => p.sectorId))];

export const serverRoutes: ServerRoute[] = [
  {
    path: 'validatore',
    renderMode: RenderMode.Prerender
  },
  {
    path: 'assistente',
    renderMode: RenderMode.Prerender
  },
  {
    path: 'catalog/:sector',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return sectorIds.map((sector) => ({ sector }));
    }
  },
  {
    path: '01/:gtin',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return products.map((p) => ({ gtin: p.gtin }));
    }
  },
  {
    // Qualsiasi combinazione di lotto (AI 10) e/o seriale (AI 21) dopo il GTIN — riconosciuta
    // lato client dallo stesso gs1-digital-link.matcher.ts usato in app.routes.ts. Spostata su
    // Client: sono identificativi di istanza (potenzialmente infiniti) e non ha senso prerenderli,
    // oltre a evitare crash di build per parametri non enumerabili staticamente.
    path: '01/:gtin/10/:lot',
    renderMode: RenderMode.Client
  },
  {
    path: '01/:gtin/21/:serial',
    renderMode: RenderMode.Client
  },
  {
    // A differenza delle due rotte precedenti, questa combinazione (lotto + seriale insieme)
    // ha un caso concreto e limitato da prerenderizzare: il traceabilityExample curato di
    // ciascun prodotto, lo stesso lotto/seriale mostrato nella demo di filiera in pagina
    // prodotto e usato come esempio nel validatore — l'unica combinazione che ci si aspetta
    // venga davvero condivisa/aperta direttamente (validator.schema.org, "copia link", ecc.),
    // a differenza di un lotto/seriale arbitrario ottenuto scansionando un codice reale.
    // Qualunque altra combinazione resta Client (fallback via 404.html, invariato).
    path: '01/:gtin/10/:lot/21/:serial',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return products
        .filter((p) => !!p.traceabilityExample)
        .map((p) => ({ gtin: p.gtin, lot: p.traceabilityExample!.lot, serial: p.traceabilityExample!.serial }));
    }
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
