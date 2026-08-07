import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { Sector } from './pages/sector/sector';
import { ProductComponent } from './pages/product/product';
import { ValidatorComponent } from './pages/validator/validator';
import { KnowledgeGraphComponent } from './pages/knowledge-graph/knowledge-graph';
import { VocabularyIndexComponent } from './pages/vocabulary/vocabulary-index';
import { VocabularyTermComponent } from './pages/vocabulary/vocabulary-term';
import { EntityComponent } from './pages/entity/entity';

export const routes: Routes = [
  { path: '', component: Home },
  // Rotta per il catalogo settori (es. /catalog/fashion)
  { path: 'catalog/:sector', component: Sector },
  { path: 'validatore', component: ValidatorComponent },
  { path: 'knowledge-graph', component: KnowledgeGraphComponent },
  // Namespace dell'estensione gs1it: (vedi src/app/data/vocabulary.ts) — sul dominio del
  // progetto, non più su gs1it.org (sito reale di GS1 Italy, non controllato da questo progetto).
  { path: 'voc', component: VocabularyIndexComponent },
  { path: 'voc/:term', component: VocabularyTermComponent },
  // Identificatori coniati per brand e organismi di certificazione (vedi
  // src/app/data/entities.ts e generate-knowledge-graph.js), stesso principio: pagina reale sul
  // dominio del progetto invece di un URI su un dominio terzo che non risponde nulla di coerente.
  { path: 'id/brand/:slug', component: EntityComponent, data: { kind: 'brand' } },
  { path: 'id/certification-body/:slug', component: EntityComponent, data: { kind: 'certificationBody' } },
  // /assistente non è più servita da Angular: quel path è instradato al chat-client React
  // (business-agent UCP), vedi docker-compose.yml. Il componente ChatComponent resta nel repo
  // come simulazione di riferimento, ma non è più raggiungibile.

  // Rotte GS1 Digital Link: un prodotto è raggiungibile a livello di prodotto (solo GTIN) o di
  // istanza specifica (GTIN + lotto e/o numero seriale, AI 10/21). Tutte le combinazioni portano
  // allo stesso ProductComponent, che legge gtin/lot/serial dai parametri di rotta in modo
  // uniforme: è lì che vive l'unificazione, non nella struttura delle rotte (l'SSR di Angular
  // richiede rotte esplicite basate su "path" per poter fare il prerendering).
  { path: '01/:gtin', component: ProductComponent },
  { path: '01/:gtin/10/:lot', component: ProductComponent },
  { path: '01/:gtin/21/:serial', component: ProductComponent },
  { path: '01/:gtin/10/:lot/21/:serial', component: ProductComponent },

  // Rotta di fallback
  { path: '**', redirectTo: '' }
];
