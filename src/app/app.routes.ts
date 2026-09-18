import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { ProductComponent } from './pages/product/product';
import { BrandComponent } from './pages/brand/brand';
import { Admin } from './pages/admin/admin';

export const routes: Routes = [
  { path: '', component: Home },
  { path: '01/:gtin', component: ProductComponent },
  // Stesso GS1 Digital Link con AI (10) lotto o (21) seriale in coda (es. /01/{gtin}/21/{sn}) —
  // la sintassi che registry-api usa davvero come upi/batchUpi per le schede BATCH/ITEM (vedi
  // registry-api/src/mockRegistryClient.ts): l'identificativo dev'essere risolvibile per
  // davvero, non solo assomigliare a un URL. ProductComponent legge comunque solo :gtin, il
  // lotto/seriale in più non cambia quale scheda mostra (la nostra tabella è chiave sul GTIN).
  { path: '01/:gtin/10/:batch', component: ProductComponent },
  { path: '01/:gtin/21/:serial', component: ProductComponent },
  // GS1 Digital Link, Application Identifier 414 (Global Location Number): pagina del brand
  // owner del prodotto, vedi BrandOwner in product.service.ts.
  { path: '414/:gln', component: BrandComponent },
  // Sezione admin (creare/modificare/pubblicare una scheda DPP) — dietro password, vedi
  // registry-api/src/auth.ts. RenderMode.Client in app.routes.server.ts.
  { path: 'admin', component: Admin },

  // Rotta di fallback
  { path: '**', redirectTo: '' }
];
