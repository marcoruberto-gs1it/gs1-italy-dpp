import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { ProductComponent } from './pages/product/product';

export const routes: Routes = [
  { path: '', component: Home },
  // /assistente non è più servita da Angular: quel path è instradato al chat-client React
  // (business-agent UCP), vedi docker-compose.yml.
  { path: '01/:gtin', component: ProductComponent },

  // Rotta di fallback
  { path: '**', redirectTo: '' }
];
