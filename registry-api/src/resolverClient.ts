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
 * upstream per la forma esatta) — un solo link "gs1:pip" verso la pagina prodotto reale: quella
 * pagina fa già da sola la content negotiation HTML/JSON-LD sullo stesso URL (vedi
 * webshop/nginx.conf), quindi è una sola risorsa, non due. Due voci "gs1:pip" con lo stesso
 * anchor (una per type) sembrava la scelta più esplicita, ma il resolver la tratta davvero come
 * un'ambiguità: senza un Accept che sceglie tra le due, un browser normale riceve "300 Multiple
 * Choices" invece del redirect atteso — verificato dal vivo, non solo dedotto dalla
 * documentazione. */
function buildLinksetDocument(record: DppRecord, siteUrl: string): Record<string, unknown> {
  const anchor = buildAnchor(record);
  const href = digitalLinkUrl(
    siteUrl,
    record.gtin,
    record.batchOrSerial ? parseBatchOrSerial(record.batchOrSerial, record.granularityLevel).ai : undefined,
    record.batchOrSerial ? parseBatchOrSerial(record.batchOrSerial, record.granularityLevel).value : undefined
  );
  return {
    anchor,
    itemDescription: record.name,
    defaultLinktype: 'gs1:pip',
    links: [{ linktype: 'gs1:pip', href, title: record.name, type: 'text/html', hreflang: ['it'] }],
  };
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
