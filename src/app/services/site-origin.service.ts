import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

/** Usato solo lato server (prerendering): non compare mai in una pagina servita a un browser. */
const SSR_FALLBACK_ORIGIN = 'https://tuodominio-produzione.it';

/**
 * Origine assoluta del sito — dominio più l'eventuale sottopercorso di pubblicazione (es. il
 * "/gs1-italy-catalog" di un project site GitHub Pages) — usata per costruire Digital Link, QR
 * code, DataMatrix e link "copia URL" che devono restare risolvibili sul dominio reale.
 *
 * Letta da `document.baseURI` (il valore effettivo di `<base href>`, impostato a build time da
 * `ng build --base-href`) invece che da `location.origin`, che restituisce solo protocollo e
 * dominio ignorando qualunque sottopercorso — producendo così, su un project site, un URL privo
 * della cartella del repository. Essendo letta a runtime anziché hardcodata, resta corretta
 * anche se in futuro cambia il dominio o il sottopercorso di pubblicazione.
 */
@Injectable({ providedIn: 'root' })
export class SiteOriginService {
  private document = inject(DOCUMENT);
  private platformId = inject(PLATFORM_ID);

  /** Es. "https://marcoruberto-gs1it.github.io/gs1-italy-catalog" (senza slash finale). */
  readonly value: string = isPlatformBrowser(this.platformId)
    ? this.document.baseURI.replace(/\/$/, '')
    : SSR_FALLBACK_ORIGIN;
}
