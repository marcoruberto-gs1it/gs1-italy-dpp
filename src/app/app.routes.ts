import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { Sector } from './pages/sector/sector';
import { ProductComponent } from './pages/product/product';
import { ValidatorComponent } from './pages/validator/validator';
import { ChatComponent } from './pages/chat/chat';

export const routes: Routes = [
  { path: '', component: Home },
  // Rotta per il catalogo settori (es. /catalog/fashion)
  { path: 'catalog/:sector', component: Sector },
  { path: 'validatore', component: ValidatorComponent },
  { path: 'assistente', component: ChatComponent },

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
