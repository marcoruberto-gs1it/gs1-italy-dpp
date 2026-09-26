import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

/** Resolver GS1 Digital Link pubblico di produzione (Render, proxy nginx davanti a
 * gs1it-dpp-resolver-web / -data-entry — vedi docs/RESOLVER-SETUP.md). */
export const PRODUCTION_RESOLVER_ORIGIN = 'https://gs1it-dpp-resolver.onrender.com';

/**
 * Origine del GS1 Digital Link Resolver a cui puntano QR code, anteprime e link "apri" — il
 * URL "vero" di un DPP è quello che passa dal resolver (`{resolver}/01/{gtin}`), non l'URL
 * diretto della pagina: è il resolver a scegliere il link type (pip di default, ?linkType=…
 * per le sezioni) e a fare la content negotiation (HTML, linkset+json, JSON-LD).
 *
 * Ordine di scelta: `<meta name="gs1-resolver-origin" content="…">` in index.html (override
 * esplicito, per un dominio custom); `http://id.localhost` con lo stack Docker in locale (sito su
 * http://localhost, senza porta — vedi docker-compose.yml); altrimenti il resolver di produzione
 * (anche per `ng serve` su :4200, dove non c'è un resolver locale). Lato server (prerender)
 * sempre il resolver di produzione, come SSR_FALLBACK_ORIGIN per il sito.
 */
@Injectable({ providedIn: 'root' })
export class ResolverOriginService {
  private document = inject(DOCUMENT);
  private platformId = inject(PLATFORM_ID);

  readonly value: string = this.detect();

  private detect(): string {
    if (!isPlatformBrowser(this.platformId)) return PRODUCTION_RESOLVER_ORIGIN;
    const meta = this.document.querySelector('meta[name="gs1-resolver-origin"]')?.getAttribute('content')?.trim();
    if (meta) return meta.replace(/\/$/, '');
    const { hostname, port } = this.document.location;
    if ((hostname === 'localhost' || hostname === 'id.localhost') && !port) return 'http://id.localhost';
    return PRODUCTION_RESOLVER_ORIGIN;
  }

  /** `{resolver}/01/{gtin}`, con `?linkType=gs1:xxx` se serve una risorsa specifica. */
  digitalLink(gtin: string, linkTypeCurie?: string): string {
    const base = `${this.value}/01/${gtin}`;
    return linkTypeCurie ? `${base}?linkType=${linkTypeCurie}` : base;
  }
}
