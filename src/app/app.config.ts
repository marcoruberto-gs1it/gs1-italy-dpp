import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideOptimus } from '@openng/optimus-ui/config';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { GS1OptimusPreset } from '../styles/optimus-preset';

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
    // darkModeSelector allineato a ThemeService (src/app/services/theme.service.ts), che
    // imposta [data-theme="dark"] su <html> — Optimus UI segue lo stesso attributo, nessuna
    // logica di tema duplicata. Niente `cssLayer`, di proposito: provato con
    // `cssLayer: { name: 'primeng' }` (con "primeng" inserito nella dichiarazione @layer di
    // src/styles.css), ma i <style> che Optimus inietta a runtime finivano comunque con
    // priorità più bassa del reset di Tailwind (bottoni trasparenti, testo ereditato invece
    // del colore del preset) — verificato che rimuovendo cssLayer il problema sparisce. Il
    // CSS di Optimus resta quindi non-layered: vince sempre sia su tokens.css (anch'esso
    // non-layered, come già oggi) sia sulle utility Tailwind (layered) — se in futuro servirà
    // sovrascrivere uno stile Optimus con una classe Tailwind diretta in un template, andrà
    // rivisto con !important o uno stile scoped più specifico.
    provideOptimus({
      theme: {
        preset: GS1OptimusPreset,
        options: {
          darkModeSelector: '[data-theme="dark"]',
        },
      },
    }),
  ]
};
