/**
 * Le due origini che registry-api mette negli URL, con ruoli DIVERSI — mai scambiabili:
 *
 * - `resolverPublicUrl()` — il GS1 Digital Link Resolver pubblico. È l'origine dell'IDENTIFICATORE
 *   del prodotto: `{resolver}/01/{gtin}` è l'URI GS1 Digital Link canonico (l'`@id` del JSON-LD,
 *   l'UPI registrato presso il DPP Registry UE, l'`anchor` del linkset, il QR). Non contiene mai
 *   `linkType` né `context`, che sono parametri del resolver e non fanno parte del Digital Link
 *   canonico (GS1 Digital Link URI Syntax §4.12).
 * - `siteUrl()` — il webshop pubblico, dove vivono le PAGINE (`/01/{gtin}`, `/product-info/…`):
 *   sono le destinazioni (`href`) a cui il resolver reindirizza, e l'URL che mock-eu-registry
 *   scarica per calcolare l'hash (liveURL).
 *
 * Nessun fallback su localhost: un identificatore che punta alla macchina di chi ha avviato il
 * servizio non è un identificatore. Senza variabile si usa il deploy di produzione di questo
 * progetto (Render); in locale si impostano SITE_URL / RESOLVER_PUBLIC_URL (docker-compose.yml).
 */
export const PRODUCTION_RESOLVER_URL = 'https://gs1it-dpp-resolver.onrender.com';
export const PRODUCTION_SITE_URL = 'https://gs1-italy-dpp-web.onrender.com';

const trim = (url: string): string => url.trim().replace(/\/$/, '');

export function resolverPublicUrl(): string {
  return trim(process.env.RESOLVER_PUBLIC_URL || PRODUCTION_RESOLVER_URL);
}

export function siteUrl(): string {
  return trim(process.env.SITE_URL || PRODUCTION_SITE_URL);
}
