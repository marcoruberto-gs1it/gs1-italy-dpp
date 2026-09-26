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
import { attributeLinkTypes } from './linkTypes.ts';

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

/** L'anchor del resolver è SEMPRE solo "/01/{gtin}", mai con un qualificatore AI (lotto/
 * seriale) in coda, anche per un DPP a livello BATCH/ITEM — a differenza di quel che ci si
 * aspetterebbe dalla sintassi GS1 Digital Link in generale. Non è una semplificazione nostra:
 * è come il resolver CE stesso risolve davvero una richiesta qualificata — web_namespace.py
 * costruisce SEMPRE `doc_id` dai soli due segmenti base (AI+valore identificativo, "01_{gtin}"),
 * anche quando l'URL richiesto ha segmenti extra in coda (DocOperationsResource, la rotta con
 * <path:extra_segments>): il qualificatore viene cercato DENTRO quel documento base (un campo
 * "qualifiers" per link, vedi web_logic.py#_do_qualifiers_match), mai come parte dell'id del
 * documento. Un anchor creato con il qualificatore in coda (es. "/01/{gtin}/10/{lotto}", quello
 * che questa funzione produceva prima) finisce quindi in un documento MongoDB separato che
 * nessuna richiesta di risoluzione troverà mai — verificato dal vivo in produzione (404
 * "No document found" sulla risoluzione, nonostante GET diretta sulla Data Entry API lo trovi
 * per quell'anchor esatto). Innocuo per questo progetto: un GTIN identifica sempre un solo DPP
 * pubblicato qui (vedi getPublishedByGtin in db.ts), mai più identità sotto lo stesso GTIN, quindi
 * non serve differenziare i link per qualificatore all'interno del documento — un solo anchor di
 * base per GTIN è già corretto. L'URL nel campo "href" (digitalLinkUrl più sotto) resta invece
 * qualificato per intero quando serve: lì è solo un link opaco verso questo sito, non un id per
 * il resolver. */
function buildAnchor(record: DppRecord): string {
  return `/01/${record.gtin}`;
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
 * diversi invece si risolvono ciascuno per conto proprio (?linkType=gs1:dpp esplicito, o
 * defaultLinktype quando la richiesta non specifica nulla), nessuna ambiguità.
 *
 * defaultLinktype è "gs1:pip" quando esiste (record statico): è il comportamento standard di
 * un resolver GS1 generico — una scansione "nuda" (senza Accept/linkType espliciti, es. da un
 * QR reader qualunque) atterra sulla pagina informazioni prodotto, non direttamente sui dati di
 * compliance del passaporto. "gs1:dpp" resta una risorsa specifica, raggiungibile solo con
 * ?linkType=gs1:dpp esplicito o dal link "Vedi il Passaporto Digitale di Prodotto completo"
 * nella pagina PIP stessa. Per i DPP utente (un solo link, "gs1:dpp") defaultLinktype resta
 * "gs1:dpp": è l'unico link che esiste, non c'è una pagina PIP fra cui scegliere. */
function buildLinksetDocument(record: DppRecord, siteUrl: string): Record<string, unknown> {
  const anchor = buildAnchor(record);
  const dppHref = digitalLinkUrl(
    siteUrl,
    record.gtin,
    record.batchOrSerial ? parseBatchOrSerial(record.batchOrSerial, record.granularityLevel).ai : undefined,
    record.batchOrSerial ? parseBatchOrSerial(record.batchOrSerial, record.granularityLevel).value : undefined
  );
  const link = (linktype: string, href: string, title: string, type = 'text/html') => ({ linktype, href, title, type, hreflang: ['it'] });
  const dppLink = link('gs1:dpp', dppHref, record.name);

  // Un link per OGNI sezione che la pagina passaporto mostra (vedi src/app/pages/product/
  // product.html, ancore `#section-<linkType>`), ciascuno con il proprio link type del GS1 Web
  // Vocabulary — solo termini che esistono davvero in gs1/WebVoc v1.16 (NON gs1:packagingInfo né
  // gs1:recyclingInfo/repairInfo: imballaggio e riciclo stanno in gs1:sustainabilityInfo, uso e
  // riparazione in gs1:instructions). Stesso URL della pagina DPP + frammento: è una sola risorsa
  // HTML, il resolver dice al client QUALE parte aprire. gs1:masterData è l'eccezione: punta alla
  // rappresentazione JSON-LD, ma con l'URL PULITO della pagina, senza query: il resolver CE
  // accoda da solo `?linkType=<curie>` (percent-encoded) a QUALUNQUE destinazione, anche dopo un
  // `#frammento` o un `?` già presente (verificato in produzione) — un href con
  // `?linkType=gs1:masterData` diventava `…?linkType=gs1:masterData?linkType=gs1%3AmasterData`,
  // valore che $wants_jsonld_qs (webshop/nginx.conf) non riconosce, e rispondeva HTML. Con l'URL
  // pulito arriva esattamente `?linkType=gs1%3AmasterData`, che nginx serve come JSON-LD.
  // Per lo stesso motivo i frammenti `#section-…` arrivano come `#section-x?linkType=…`: la
  // pagina passaporto li normalizza (product.ts#scrollToFragment).
  // Un link per link type, mai due con lo stesso sullo stesso anchor: due link uguali producono
  // un 300 Multiple Choices (vedi il commento più sotto).
  const withFragment = (linkType: string) => `${dppHref}#section-${linkType}`;
  const sectionLinks = [
    link('gs1:masterData', dppHref, `${record.name} — dati tecnici (JSON-LD)`, 'application/ld+json'),
    link('gs1:traceability', withFragment('traceability'), `${record.name} — tracciabilità e ciclo di vita`),
  ];
  if (record.registryId) {
    sectionLinks.push(link('gs1:registryEntry', withFragment('registryEntry'), `${record.name} — registrazione sul registro UE`));
  }
  const present = attributeLinkTypes(record.attributes);
  if (present.has('sustainabilityInfo')) {
    sectionLinks.push(link('gs1:sustainabilityInfo', withFragment('sustainabilityInfo'), `${record.name} — sostenibilità, riciclo e imballaggio`));
  }
  if (present.has('certificationInfo')) {
    sectionLinks.push(link('gs1:certificationInfo', withFragment('certificationInfo'), `${record.name} — certificazioni`));
  }
  if (present.has('safetyInfo')) {
    sectionLinks.push(link('gs1:safetyInfo', withFragment('safetyInfo'), `${record.name} — sicurezza`));
  }
  if (present.has('instructions')) {
    sectionLinks.push(link('gs1:instructions', withFragment('instructions'), `${record.name} — istruzioni, riparazione e ricambi`));
  }

  if (!record.isStatic) {
    return { anchor, itemDescription: record.name, defaultLinktype: 'gs1:dpp', links: [dppLink, ...sectionLinks] };
  }

  // Stesso dominio/GTIN della pagina DPP, rotta diversa — vedi src/app/app.routes.ts
  // ('product-info/:gtin') e webshop/nginx.conf (location /product-info, stesso trattamento
  // client-side di /admin).
  const pipHref = `${siteUrl.replace(/\/$/, '')}/product-info/${record.gtin}`;
  const pipLink = link('gs1:pip', pipHref, record.name);
  return { anchor, itemDescription: record.name, defaultLinktype: 'gs1:pip', links: [pipLink, dppLink, ...sectionLinks] };
}

/** Crea o aggiorna l'entry — PUT prima (idempotente se esiste già), POST /new come fallback se
 * il PUT risponde 404 (prima registrazione di questo anchor) O 405 (Method Not Allowed: il
 * resolver CE espone PUT/DELETE solo sulla rotta a DUE segmenti "/<ai_code>/<ai>", non su quella
 * con un qualificatore AI extra in coda per lotto/seriale, "/<ai_code>/<ai>/<extra>" — vedi
 * DocOperationsQualified in data_entry_namespace.py, che implementa solo GET. Un DPP con
 * batchOrSerial (anchor tipo "/01/{gtin}/10/{lotto}") finirebbe quindi sempre in 405 al primo
 * PUT, mai in 404 — verificato dal vivo in produzione, non dedotto dalla documentazione. POST
 * /new fa comunque upsert su qualunque forma di anchor (vedi NewDocOperations nello stesso
 * file), quindi resta il fallback corretto anche qui. Non lancia mai: una pubblicazione riuscita
 * verso mock-eu-registry non deve fallire per un resolver non raggiungibile o non configurato —
 * solo un avviso in log, verificabile a parte. */
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
    if (putResponse.status !== 404 && putResponse.status !== 405) {
      console.warn(`resolverClient: PUT ${anchor} → ${putResponse.status}: ${await putResponse.text()}`);
      return;
    }
    // 404 (anchor non esistente) o 405 (anchor con qualificatore AI, PUT non supportato lì) —
    // in entrambi i casi POST /new fa comunque l'upsert corretto.
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
