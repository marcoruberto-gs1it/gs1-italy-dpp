import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' })
    ),
    provideClientHydration(),
    // withFetch: usato solo dalla sezione admin (RenderMode.Client, vedi app.routes.server.ts)
    // per parlare con registry-api — nessun'altra pagina del sito fa chiamate HTTP client-side.
    provideHttpClient(withFetch()),
  ]
};
