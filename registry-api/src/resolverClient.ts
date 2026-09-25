/**
 * Client verso il GS1 Digital Link Resolver CE vendorizzato in resolver/ (vedi resolver/README.md
 * per il perché e per l'orchestrazione Docker) — un vero GS1-Conformant Resolver, non l'ennesima
 * generazione "a mano" di un linkset. Sincronizza una entry per ogni DPP PUBBLICATO (mai una
 * bozza, stessa regola già in vigore per JSON-LD/pagina pubblica — vedi getPublishedByGtin in
 * db.ts): il resolver risponde a `id.<dominio>/01/{gtin}[...]` con un redirect 307 o, a chi
 * chiede `Accept: application/linkset+json`, il linkset vero e proprio — puntando sempre alla
 * pagina prodotto REALE di questo sito (mai un contenuto proprio: mock-eu-registry scarica e
 * verifica l'hash di quella pagina, non di questo resolver, vedi mockRegistryClient.ts).
 *
 * Data Entry API del resolver (verificata contro tests/setup_test.py del progetto upstream):
 *   POST   {RESOLVER_API_URL}/new     crea una entry (409/400 se l'anchor esiste già — non
 *                                     verificato quale dei due, gestito comunque sotto)
 *   PUT    {RESOLVER_API_URL}{anchor} aggiorna, merge idempotente sui link esistenti — 404 se
 *                                     l'anchor non esiste ancora
 *   DELETE {RESOLVER_API_URL}{anchor} elimina l'intera entry
 * Autenticazione: header `Authorization: Bearer <RESOLVER_SESSION_TOKEN>` su tutte e tre.
 */
import type { DppRecord, GranularityLevel } from './db.ts';

/** Stessa funzione di jsonld.ts/mockRegistryClient.ts, duplicata qui per lo stesso motivo già
 * documentato in quei due file: nessuna dipendenza incrociata tra moduli che parlano con
 * servizi esterni diversi, anche all'interno dello stesso registry-api. */
function digitalLinkUrl(siteUrl: string, gtin: string, ai?: '10' | '21', value?: string): string {
  const base = `${siteUrl.replace(/\/$/, '')}/01/${gtin}`;
  return ai && value ? `${base}/${ai}/${encodeURIComponent(value)}` : base;
}

function parseBatchOrSerial(batchOrSerial: string, granularityLevel: GranularityLevel): { ai: '10' | '21'; value: string } {
  const value = batchOrSerial.replace(/^\(\d{2}\)\s*/, '').trim();
  const ai = /^\(21\)/.test(batchOrSerial) || granularityLevel === 'ITEM' ? '21' : '10';
  return { ai, value };
}

/** L'anchor del resolver è solo il PATH del GS1 Digital Link (es. "/01/{gtin}/21/{seriale}"),
 * mai il dominio: il resolver ci mette il proprio (FQDN, vedi docker-compose.yml) davanti da
 * solo. Stessa deduzione AI di buildUpi() in jsonld.ts/mockRegistryClient.ts. */
function buildAnchor(record: DppRecord): string {
  if (record.granularityLevel === 'MODEL' || !record.batchOrSerial) {
    return `/01/${record.gtin}`;
  }
  const { ai, value } = parseBatchOrSerial(record.batchOrSerial, record.granularityLevel);
  return `/01/${record.gtin}/${ai}/${encodeURIComponent(value)}`;
}

function requiredConfig(): { apiUrl: string; token: string } | null {
  const apiUrl = process.env.RESOLVER_API_URL;
  const token = process.env.RESOLVER_SESSION_TOKEN;
  // Silenzioso e non bloccante di proposito, stessa filosofia di mockRegistryClient.ts per
  // MOCK_EU_REGISTRY_URL: senza token il resto dell'admin continua a funzionare, solo la
  // sincronizzazione col resolver viene saltata — utile finché non lo si è configurato (vedi
  // docs/RESOLVER-SETUP.md), non deve rompere una pubblicazione che altrimenti riuscirebbe.
  if (!apiUrl || !token) return null;
  return { apiUrl: apiUrl.replace(/\/$/, ''), token };
}

/** Il documento che il resolver si aspetta (vedi tests/test_01_09506000134352.json nel progetto
 * upstream per la forma esatta).
 *
 * Un solo link "gs1:dpp" (Digital Product Passport, https://ref.gs1.org/voc/dpp) per i DPP
 * creati da un utente vero: quella pagina fa già da sola la content negotiation HTML/JSON-LD
 * sullo stesso URL (vedi webshop/nginx.conf), quindi è una sola risorsa, non due. "gs1:dpp"
 * invece del più generico "gs1:pip" perché questa pagina è specificamente il Digital Product
 * Passport, non una Product Information Page qualunque — GS1 distingue esplicitamente i due
 * link type nel proprio vocabolario.
 *
 * Due link, "gs1:pip" + "gs1:dpp", per i 10 DPP statici del carosello home (record.isStatic,
 * vedi seed.ts): a differenza dei DPP utente, questi hanno anche una vera pagina "informazioni
 * prodotto" distinta (src/app/pages/product-info/), consumer-facing, senza dati di compliance —
 * vedi il componente Angular per il contenuto esatto. Linktype DIVERSI fra loro (non due voci
 * "gs1:pip" con URL diverso): il resolver tratta due link con lo STESSO linktype sullo stesso
 * anchor come un'ambiguità reale — senza un Accept che sceglie fra le due, un browser normale
 * riceve "300 Multiple Choices" invece del redirect atteso (verificato dal vivo). Linktype
 * diversi invece si risolvono ciascuno per conto proprio (?linkType=gs1:pip esplicito, o
 * defaultLinktype quando la richiesta non specifica nulla), nessuna ambiguità. defaultLinktype
 * resta "gs1:dpp" in entrambi i casi: è la pagina che mostra i dati del passaporto, il cuore di
 * questa demo — "gs1:pip" resta comunque raggiungibile esplicitamente. */
function buildLinksetDocument(record: DppRecord, siteUrl: string): Record<string, unknown> {
  const anchor = buildAnchor(record);
  const dppHref = digitalLinkUrl(
    siteUrl,
    record.gtin,
    record.batchOrSerial ? parseBatchOrSerial(record.batchOrSerial, record.granularityLevel).ai : undefined,
    record.batchOrSerial ? parseBatchOrSerial(record.batchOrSerial, record.granularityLevel).value : undefined
  );
  const dppLink = { linktype: 'gs1:dpp', href: dppHref, title: record.name, type: 'text/html', hreflang: ['it'] };

  if (!record.isStatic) {
    return { anchor, itemDescription: record.name, defaultLinktype: 'gs1:dpp', links: [dppLink] };
  }

  // Stesso dominio/GTIN della pagina DPP, rotta diversa — vedi src/app/app.routes.ts
  // ('product-info/:gtin') e webshop/nginx.conf (location /product-info, stesso trattamento
  // client-side di /admin).
  const pipHref = `${siteUrl.replace(/\/$/, '')}/product-info/${record.gtin}`;
  const pipLink = { linktype: 'gs1:pip', href: pipHref, title: record.name, type: 'text/html', hreflang: ['it'] };
  return { anchor, itemDescription: record.name, defaultLinktype: 'gs1:dpp', links: [pipLink, dppLink] };
}

/** Crea o aggiorna l'entry — PUT prima (idempotente se esiste già), POST /new come fallback se
 * il PUT risponde 404 (prima registrazione di questo anchor). Non lancia mai: una pubblicazione
 * riuscita verso mock-eu-registry non deve fallire per un resolver non raggiungibile o non
 * configurato — solo un avviso in log, verificabile a parte. */
export async function syncResolverEntry(record: DppRecord, siteUrl: string): Promise<void> {
  const config = requiredConfig();
  if (!config) return;

  const anchor = buildAnchor(record);
  const document = buildLinksetDocument(record, siteUrl);
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.token}`,
  };

  try {
    const putResponse = await fetch(`${config.apiUrl}${anchor}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(document),
      signal: AbortSignal.timeout(10_000),
    });
    if (putResponse.ok) return;
    if (putResponse.status !== 404) {
      console.warn(`resolverClient: PUT ${anchor} → ${putResponse.status}: ${await putResponse.text()}`);
      return;
    }
    // 404: l'anchor non esisteva ancora, prima registrazione — crealo.
    const postResponse = await fetch(`${config.apiUrl}/new`, {
      method: 'POST',
      headers,
      body: JSON.stringify(document),
      signal: AbortSignal.timeout(10_000),
    });
    if (!postResponse.ok) {
      console.warn(`resolverClient: POST /new ${anchor} → ${postResponse.status}: ${await postResponse.text()}`);
    }
  } catch (err) {
    console.warn(`resolverClient: sincronizzazione fallita per ${anchor}:`, err instanceof Error ? err.message : err);
  }
}

/** Non ancora richiamata da nessuna rotta: un DPP pubblicato non è mai eliminabile in questa
 * demo (vedi routes/dpp.ts/routes/v1.ts), quindi la entry corrispondente sul resolver non ha
 * ancora un caso d'uso reale che la inneschi — scritta comunque per completezza dell'API di
 * questo modulo, sullo stesso principio "non bloccante" di syncResolverEntry sopra. */
export async function deleteResolverEntry(record: DppRecord): Promise<void> {
  const config = requiredConfig();
  if (!config) return;
  const anchor = buildAnchor(record);
  try {
    const response = await fetch(`${config.apiUrl}${anchor}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok && response.status !== 404) {
      console.warn(`resolverClient: DELETE ${anchor} → ${response.status}: ${await response.text()}`);
    }
  } catch (err) {
    console.warn(`resolverClient: eliminazione fallita per ${anchor}:`, err instanceof Error ? err.message : err);
  }
}
