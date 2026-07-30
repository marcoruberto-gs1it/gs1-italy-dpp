import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface KgProductNode {
  id: string;
  gtin: string;
  name: string;
  brandId?: string;
  certifiedByIds: string[];
}

export interface KgHub {
  id: string;
  label: string;
  type: 'brand' | 'certificationBody';
  productIds: string[];
}

export interface KgStats {
  products: number;
  organizations: number;
  brands: number;
  certificationBodies: number;
  totalNodes: number;
}

export interface KgGraph {
  products: KgProductNode[];
  hubs: KgHub[];
  stats: KgStats;
}

export interface SparqlResult {
  variables: string[];
  rows: Record<string, string>[];
  tookMs: number;
}

const GRAPH_URL = 'knowledge-graph.jsonld';
// Stesso schema usato da productId() in generate-knowledge-graph.js.
const PRODUCT_ID_PREFIX = 'https://id.gs1.org/01/';

/**
 * Legge dist/.../knowledge-graph.jsonld (generato a build time da generate-knowledge-graph.js,
 * vedi quel file per come sono strutturati nodi e archi) e lo espone in due forme:
 *
 * 1. graph() — nodi/archi già interpretati in JS puro, per la visualizzazione hub-and-spoke: non
 *    richiede il motore SPARQL, quindi la pagina mostra qualcosa di utile anche prima che
 *    l'utente apra il pannello di query.
 * 2. query() — esecuzione SPARQL reale, lazy: oxigraph (motore WASM) e jsonld (per l'espansione
 *    JSON-LD → RDF) vengono caricati solo alla prima query, non nel bundle iniziale.
 */
@Injectable({ providedIn: 'root' })
export class KnowledgeGraphService {
  private platformId = inject(PLATFORM_ID);

  private rawGraphPromise: Promise<any> | null = null;
  private storePromise: Promise<any> | null = null;

  private async fetchRawGraph(): Promise<any> {
    if (!this.rawGraphPromise) {
      this.rawGraphPromise = fetch(GRAPH_URL).then((res) => {
        if (!res.ok) throw new Error(`${GRAPH_URL}: HTTP ${res.status}`);
        return res.json();
      });
    }
    return this.rawGraphPromise;
  }

  async graph(): Promise<KgGraph> {
    const doc = await this.fetchRawGraph();
    const nodes: any[] = doc['@graph'] ?? [];

    const products: KgProductNode[] = [];
    const hubMeta = new Map<string, { label: string; type: 'brand' | 'certificationBody' }>();
    let organizations = 0;

    for (const node of nodes) {
      const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
      if (types.includes('Brand')) {
        hubMeta.set(node['@id'], { label: node.name, type: 'brand' });
      } else if (types.includes('gs1it:CertificationBody')) {
        const label = node['gs1:organizationName']?.[0]?.['@value'] ?? node['@id'];
        hubMeta.set(node['@id'], { label, type: 'certificationBody' });
      } else if (types.includes('Organization')) {
        organizations++;
      } else if (typeof node['@id'] === 'string' && node['@id'].startsWith(PRODUCT_ID_PREFIX)) {
        // Il GTIN si legge dall'@id (sempre impostato dal generatore), non da gs1:gtin: 22 dei
        // 47 prodotti AI-ready pubblicano solo schema.org e non hanno affatto quella proprietà.
        const certifiedByIds: string[] = (node['gs1:certification'] ?? [])
          .map((c: any) => c['gs1it:certifiedBy']?.['@id'])
          .filter((id: string | undefined): id is string => !!id);
        products.push({
          id: node['@id'],
          gtin: node['@id'].slice(PRODUCT_ID_PREFIX.length),
          name: node.name,
          brandId: node.brand?.['@id'],
          certifiedByIds,
        });
      }
    }

    const hubs: KgHub[] = [...hubMeta.entries()].map(([id, meta]) => ({
      id,
      label: meta.label,
      type: meta.type,
      productIds: products
        .filter((p) => p.brandId === id || p.certifiedByIds.includes(id))
        .map((p) => p.id),
    }));

    return {
      products,
      hubs,
      stats: {
        products: products.length,
        organizations,
        brands: hubs.filter((h) => h.type === 'brand').length,
        certificationBodies: hubs.filter((h) => h.type === 'certificationBody').length,
        totalNodes: nodes.length,
      },
    };
  }

  /** Numero di triple RDF nel grafo espanso — calcolato solo quando serve (apre il motore SPARQL). */
  async tripleCount(): Promise<number> {
    const store = await this.getStore();
    return store.size;
  }

  private async getStore(): Promise<any> {
    if (!isPlatformBrowser(this.platformId)) {
      throw new Error('Il motore SPARQL richiede il browser (WASM).');
    }
    if (!this.storePromise) {
      this.storePromise = (async () => {
        // Sottopercorso esplicito, non 'oxigraph' nudo: il campo "browser" del package.json
        // guida i bundler verso web.js (WASM) a runtime, ma TypeScript risolve i tipi da "main"
        // (node.js, binding nativo, non richiede init()) a prescindere — con l'import diretto i
        // due si allineano.
        const [{ default: init, Store }, { default: jsonld }, doc] = await Promise.all([
          import('oxigraph/web'),
          import('jsonld'),
          this.fetchRawGraph(),
        ]);
        await init();
        const nquads = await jsonld.toRDF(doc, { format: 'application/n-quads' });
        const store = new Store();
        store.load(nquads, { format: 'application/n-quads' });
        return store;
      })();
    }
    return this.storePromise;
  }

  async query(sparql: string): Promise<SparqlResult> {
    const store = await this.getStore();
    const t0 = performance.now();
    const result = store.query(sparql);
    const tookMs = performance.now() - t0;

    if (!Array.isArray(result)) {
      throw new Error('Sono supportate solo query SELECT.');
    }

    const variableOrder: string[] = [];
    const seen = new Set<string>();
    for (const row of result) {
      for (const key of row.keys()) {
        if (!seen.has(key)) {
          seen.add(key);
          variableOrder.push(key);
        }
      }
    }

    const rows = result.map((row: Map<string, { value: string }>) => {
      const out: Record<string, string> = {};
      for (const v of variableOrder) out[v] = row.get(v)?.value ?? '';
      return out;
    });

    return { variables: variableOrder, rows, tookMs };
  }
}
