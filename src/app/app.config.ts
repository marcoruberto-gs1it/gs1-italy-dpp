import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

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
    // Componenti Spartan/ui (select in /admin, vedi src/app/ui/): disattiva il popover CDK di
    // default, che altrimenti renderebbe il menu del select sopra i nostri elementi
    // position:fixed (toast, dialog di pubblicazione).
    provideSpartanHlm(),
  ]
};
