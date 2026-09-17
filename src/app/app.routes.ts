import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { ProductComponent } from './pages/product/product';
import { BrandComponent } from './pages/brand/brand';
import { Admin } from './pages/admin/admin';

export const routes: Routes = [
  { path: '', component: Home },
  { path: '01/:gtin', component: ProductComponent },
  // GS1 Digital Link, Application Identifier 414 (Global Location Number): pagina del brand
  // owner del prodotto, vedi BrandOwner in product.service.ts.
  { path: '414/:gln', component: BrandComponent },
  // Sezione admin (creare/modificare/pubblicare una scheda DPP) — dietro password, vedi
  // registry-api/src/auth.ts. RenderMode.Client in app.routes.server.ts.
  { path: 'admin', component: Admin },

  // Rotta di fallback
  { path: '**', redirectTo: '' }
];
