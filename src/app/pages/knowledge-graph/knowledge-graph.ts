import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { I18nService } from '../../services/i18n.service';
import { KgGraph, KgHub, KnowledgeGraphService, SparqlResult } from '../../services/knowledge-graph.service';

interface ExampleQuery {
  labelKey: string;
  sparql: string;
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1).trimEnd() + '…' : text;
}

const EXAMPLE_QUERIES: ExampleQuery[] = [
  {
    labelKey: 'sameBrand',
    sparql: `PREFIX schema: <https://schema.org/>
SELECT ?product WHERE {
  ?brand schema:name "GS1 Italy Sapori" .
  ?p schema:brand ?brand ;
     schema:name ?product .
} ORDER BY ?product`,
  },
  {
    labelKey: 'sameCertifier',
    sparql: `PREFIX schema: <https://schema.org/>
PREFIX gs1: <https://ref.gs1.org/voc/>
PREFIX gs1it: <https://gs1it.org/voc/>
SELECT ?product WHERE {
  <https://id.gs1.org/01/08032089000079> gs1:certification ?cert .
  ?cert gs1it:certifiedBy ?body .
  ?otherCert gs1it:certifiedBy ?body .
  ?otherProduct gs1:certification ?otherCert ;
                schema:name ?product .
  FILTER(?otherProduct != <https://id.gs1.org/01/08032089000079>)
}`,
  },
  {
    labelKey: 'countByBrand',
    sparql: `PREFIX schema: <https://schema.org/>
SELECT ?brandName (COUNT(?product) AS ?count) WHERE {
  ?product schema:brand ?brand .
  ?brand schema:name ?brandName .
} GROUP BY ?brandName ORDER BY DESC(?count)`,
  },
];

@Component({
  selector: 'app-knowledge-graph',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './knowledge-graph.html',
  styleUrl: './knowledge-graph.css',
})
export class KnowledgeGraphComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private titleService = inject(Title);
  private kg = inject(KnowledgeGraphService);
  protected t = inject(I18nService).t;

  isBrowser = signal(false);
  loadError = signal<string | null>(null);
  graphData = signal<KgGraph | null>(null);
  selectedHubId = signal<string | null>(null);

  protected exampleQueries = EXAMPLE_QUERIES;
  sparqlInput = signal(EXAMPLE_QUERIES[0].sparql);
  queryLoading = signal(false);
  queryError = signal<string | null>(null);
  queryResult = signal<SparqlResult | null>(null);
  engineActive = signal(false);
  tripleCount = signal<number | null>(null);

  selectedHub = computed<KgHub | null>(() => {
    const id = this.selectedHubId();
    return this.graphData()?.hubs.find((h) => h.id === id) ?? null;
  });

  selectedHubProducts = computed(() => {
    const hub = this.selectedHub();
    const graph = this.graphData();
    if (!hub || !graph) return [];
    return hub.productIds
      .map((id) => graph.products.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p);
  });

  // Layout radiale per il diagramma hub-and-spoke: hub al centro, prodotti disposti in cerchio
  // attorno, un arco per ciascuno. Nessuna libreria di grafi: con al massimo una decina di nodi
  // per hub una disposizione calcolata è più leggibile di una simulazione a forze.
  //
  // text-anchor dipende dal quadrante: un'etichetta centrata sui nodi vicini al bordo sinistro o
  // destro del viewBox uscirebbe tagliata (verificato: succede davvero con nomi prodotto lunghi
  // vicino a x=0/x=600) — ancorandola start/end invece che middle si estende verso il centro,
  // dove c'è margine.
  spokeLayout = computed(() => {
    const products = this.selectedHubProducts();
    const n = products.length;
    const cx = 300;
    const cy = 300;
    const r = 220;
    return products.map((p, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      // I nodi a destra (cos > 0) devono estendere l'etichetta verso sinistra (anchor "end"), i
      // nodi a sinistra verso destra (anchor "start") — cioè sempre verso il centro, dove c'è
      // margine nel viewBox.
      const anchor = Math.cos(angle) > 0.3 ? 'end' : Math.cos(angle) < -0.3 ? 'start' : 'middle';
      const labelDx = anchor === 'start' ? 12 : anchor === 'end' ? -12 : 0;
      // Etichette a indice dispari spostate un po' più in basso: con nodi ravvicinati
      // angolarmente (tanti prodotti sullo stesso hub) evita che due etichette adiacenti,
      // entrambe alla stessa altezza, si sovrappongano.
      const labelDy = i % 2 === 0 ? 20 : 32;
      return { product: p, x, y, anchor, labelDx, labelDy, label: truncate(p.name, 20) };
    });
  });

  ngOnInit(): void {
    this.isBrowser.set(isPlatformBrowser(this.platformId));
    this.titleService.setTitle(this.t('kg.pageTitle'));
    if (this.isBrowser()) {
      void this.loadGraph();
    }
  }

  private async loadGraph(): Promise<void> {
    try {
      const graph = await this.kg.graph();
      this.graphData.set(graph);
      if (graph.hubs.length) this.selectedHubId.set(graph.hubs[0].id);
    } catch (err) {
      this.loadError.set(err instanceof Error ? err.message : this.t('kg.loadErrorGeneric'));
    }
  }

  selectHub(id: string): void {
    this.selectedHubId.set(id);
  }

  loadExampleQuery(query: ExampleQuery): void {
    this.sparqlInput.set(query.sparql);
  }

  setSparqlInput(value: string): void {
    this.sparqlInput.set(value);
  }

  async runQuery(): Promise<void> {
    this.queryError.set(null);
    this.queryLoading.set(true);
    try {
      const result = await this.kg.query(this.sparqlInput());
      this.queryResult.set(result);
      this.engineActive.set(true);
      if (this.tripleCount() === null) {
        this.kg.tripleCount().then((n) => this.tripleCount.set(n));
      }
    } catch (err) {
      this.queryError.set(err instanceof Error ? err.message : this.t('kg.queryErrorGeneric'));
    } finally {
      this.queryLoading.set(false);
    }
  }
}
