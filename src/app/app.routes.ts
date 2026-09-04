import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { ProductComponent } from './pages/product/product';
import { BrandComponent } from './pages/brand/brand';

export const routes: Routes = [
  { path: '', component: Home },
  // /assistente non è più servita da Angular: quel path è instradato al chat-client React
  // (business-agent UCP), vedi docker-compose.yml.
  { path: '01/:gtin', component: ProductComponent },
  // GS1 Digital Link, Application Identifier 414 (Global Location Number): pagina del brand
  // owner del prodotto, vedi BrandOwner in product.service.ts.
  { path: '414/:gln', component: BrandComponent },

  // Rotta di fallback
  { path: '**', redirectTo: '' }
];
