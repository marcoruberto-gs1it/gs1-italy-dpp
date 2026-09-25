/**
 * Client verso mock-eu-registry (https://github.com/CIRPASS-2/mock-eu-registry) — il registro
 * di riferimento UE per il DPP: sa solo identificativo, URL e hash di una scheda, non i suoi
 * dati (vedi commento in src/app/data/sectors.ts e la sezione "Cos'è il DPP" della home per il
 * perché di questa separazione).
 *
 * Autenticazione: client-credentials grant Auth0 (Machine-to-Machine) — è una chiamata
 * server-to-server, non un login utente: la nostra sezione admin ha già il proprio cancello
 * (vedi auth.ts), questo è un secondo livello, verso il registro stesso.
 *
 * Forma del payload verificata sia rileggendo lo schema vero (main/src/main/resources/
 * json-schema/default-schema.json nel repo di mock-eu-registry) campo per campo, sia con
 * richieste reali riuscite contro l'istanza live — che non sempre concordano: per
 * granularityLevel=ITEM lo schema sul branch main dichiara batchUpi facoltativo, ma l'istanza
 * pubblicata (immagine Docker :latest, evidentemente non allineata al branch) lo rifiuta come
 * mancante se omesso. Dove i due divergono vince il comportamento verificato dal vivo.
 *
 * ATTENZIONE (importante per chi legge questo file conoscendo il quadro normativo CEN/CENELEC):
 * mock-eu-registry è l'implementazione di riferimento CIRPASS-2, con un proprio schema JSON —
 * NON è la stessa cosa del metodo astratto di registrazione che lo standard descrive a livello
 * concettuale, con nomi di campo diversi (schema completo in dpp-api-specification.md). I due
 * non sono intercambiabili: lo standard descrive il CONCETTO, mock-eu-registry è
 * un'implementazione concreta con le sue scelte di naming. NON "correggere" i nomi qui sotto per
 * farli combaciare con lo standard: romperebbe le richieste vere contro il registro live.
 * Corrispondenza concettuale, campo per campo, tra ciò che inviamo davvero (a sinistra) e il
 * concetto equivalente nello standard (a destra):
 *   upi              ~ identificativo univoco di prodotto (UPI)
 *   reoId            ~ identificativo dell'operatore economico
 *   liveURL          ~ endpoint API del passaporto
 *   granularityLevel ~ granularità — stesso concetto, casing diverso: MODEL/BATCH/ITEM qui,
 *                      "model"/"batch"/"item" nel JSON-LD pubblico (vedi toStandardGranularity in
 *                      jsonld.ts — minuscolo perché richiesto dallo standard, non un refuso) —
 *                      questo file invece deve restare MAIUSCOLO, il valore verificato dal vivo
 *                      contro lo schema di mock-eu-registry.
 *   (nessun campo)   ~ identificativo dell'istanza del passaporto (non richiesto da
 *                      mock-eu-registry; esposto comunque nel nostro JSON-LD pubblico, vedi
 *                      jsonld.ts)
 * commodityCode, facilitiesId, modelUpi, batchUpi, deactivated, backupURL sono campi propri
 * dello schema di mock-eu-registry, senza un concetto equivalente nello standard (che lascia i
 * dettagli del payload di registrazione all'implementazione del registro) — un campo dello
 * standard equivalente a productGroup, viceversa, non ha equivalente qui: mock-eu-registry non lo
 * richiede.
 */
import type { DppRecord, GranularityLevel } from './db.ts';
import type { SectorId } from './sectors.ts';

export interface RegistrationResult {
  registryId: string;
  /** null se la registrazione riesce ma il recupero della proof fallisce — non blocchiamo la
   * pubblicazione per questo, vedi commento su getProof qui sotto. */
  proofJwt: string | null;
  /** Il payload esatto inviato a mock-eu-registry e la risposta esatta ricevuta — non
   * ricostruiti lato client, sono gli stessi byte davvero scambiati con l'API. Servono solo a
   * mostrare all'utente (vedi PublishJourneyComponent) cosa succede davvero dietro
   * l'animazione, non a nessuna logica applicativa. */
  request: Record<string, unknown>;
  response: Record<string, unknown>;
}

class RegistryNotConfiguredError extends Error {
  constructor() {
    super('Registro UE non configurato: mancano le variabili MOCK_EU_REGISTRY_URL / AUTH0_*. Vedi docs/REGISTRY-SETUP.md.');
    this.name = 'RegistryNotConfiguredError';
  }
}

/** Un 502/503/504 qui è quasi sempre il piano gratuito di Render che sta risvegliando
 * mock-eu-registry (avvio JVM/Quarkus, anche 40-60s) — non un errore applicativo del
 * registro, che altrimenti risponderebbe con un body JSON suo. routes/dpp.ts la usa per
 * dire al frontend "riprova da solo", invece di mostrare un errore tecnico all'utente. */
export class TransientRegistryError extends Error {}

/** Nessuna delle tre chiamate esterne qui sotto (Auth0, registrazione, proof) aveva mai un
 * limite di tempo: se un servizio accettava la connessione TCP ma non rispondeva mai (non un
 * 502/503/504 — quello è già gestito — ma un silenzio totale), la Promise restava sospesa per
 * sempre. Da qui il pubblicazione "che si blocca": l'animazione in admin resta ferma sul passo
 * "Verifica del Digital Link" perché sta davvero aspettando una risposta che non arriverà mai, e
 * senza un errore non scatta nemmeno il retry automatico lato client (admin.ts). AbortSignal.timeout
 * trasforma quel silenzio in un errore concreto entro un tempo massimo — 90s per la
 * registrazione vera e propria (deve tollerare un risveglio a freddo doppio: sia mock-eu-registry
 * sia, dentro la sua stessa richiesta, il nostro sito che scarica per calcolare l'hash), meno per
 * le chiamate che non hanno lo stesso motivo di essere lente. */
const AUTH0_TIMEOUT_MS = 20_000;
const REGISTER_TIMEOUT_MS = 90_000;
const PROOF_TIMEOUT_MS = 15_000;

/** Un timeout scaduto (AbortSignal.timeout) rifiuta con una DOMException 'TimeoutError' —
 * un'interruzione manuale (AbortController.abort() senza motivo) darebbe invece 'AbortError'.
 * Qui trattiamo entrambe come "il servizio non ha risposto in tempo", non un errore applicativo. */
function isAbortOrTimeout(err: unknown): boolean {
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
}

/** 429 (rate limit, sia da Auth0 sia da mock-eu-registry) è transitorio per definizione — "hai
 * fatto troppe richieste, riprova" non è mai un rifiuto definitivo come lo sarebbe un payload
 * malformato. Prima non era distinto dagli altri errori non-2xx: un 429 diventava un fallimento
 * definitivo mostrato subito all'utente, invece di rientrare nello stesso retry automatico già
 * previsto per un container che si sta risvegliando (vedi TransientRegistryError più sotto e
 * PUBLISH_RETRY_DELAYS_MS in admin.ts). Se il servizio manda "Retry-After" lo riportiamo nel
 * messaggio — solo per visibilità nel dettaglio tecnico dell'errore, il retry automatico lato
 * client segue comunque i propri tempi fissi, non (ancora) quel valore. */
function retryAfterSuffix(response: Response): string {
  const retryAfter = response.headers.get('retry-after');
  return retryAfter ? ` (Retry-After: ${retryAfter}s)` : '';
}

/** Codice merceologico (HS/TARIC, 4-10 cifre — obbligatorio nello schema di mock-eu-registry,
 * che rifiuta stringhe libere) plausibile per settore. Solo per la demo: non è una
 * classificazione doganale verificata prodotto per prodotto. */
const COMMODITY_CODES: Record<SectorId, string> = {
  battery: '85076000',
  apparel: '61091000',
  steel: '72071100',
  construction: '68061000',
  aluminium: '76061100',
  tyres: '40111000',
  furniture: '94013000',
  mattresses: '94042100',
  ict: '85176200',
  // Capitolo 34 (saponi, agenti organici tensioattivi, preparati per il bucato) — voce 3402.
  detergents: '34022090',
};

function requiredConfig() {
  const registryUrl = process.env.MOCK_EU_REGISTRY_URL;
  const auth0Domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_M2M_CLIENT_ID;
  const clientSecret = process.env.AUTH0_M2M_CLIENT_SECRET;
  const audience = process.env.AUTH0_M2M_AUDIENCE;

  if (!registryUrl || !auth0Domain || !clientId || !clientSecret || !audience) {
    throw new RegistryNotConfiguredError();
  }
  return { registryUrl: registryUrl.replace(/\/$/, ''), auth0Domain, clientId, clientSecret, audience };
}

/** Token M2M di breve durata: se ne richiede uno nuovo a ogni pubblicazione, niente cache —
 * il volume atteso (pubblicazioni manuali dall'admin) non giustifica la complessità di una
 * cache con scadenza. */
async function fetchAccessToken(config: ReturnType<typeof requiredConfig>): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`https://${config.auth0Domain}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        audience: config.audience,
      }),
      signal: AbortSignal.timeout(AUTH0_TIMEOUT_MS),
    });
  } catch (err) {
    if (isAbortOrTimeout(err)) throw new TransientRegistryError(`Auth0 non ha risposto entro ${AUTH0_TIMEOUT_MS / 1000}s.`);
    throw err;
  }
  if (!response.ok) {
    if (response.status === 429) {
      throw new TransientRegistryError(`Auth0 ha risposto 429 (troppe richieste)${retryAfterSuffix(response)}: ${await response.text()}`);
    }
    throw new Error(`Auth0 non ha rilasciato un token (${response.status}): ${await response.text()}`);
  }
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

/** In locale (o ovunque SITE_URL non sia pubblicamente raggiungibile) mock-eu-registry PROVA
 * comunque a scaricare il liveURL, impiega decine di secondi a scoprire che l'host non risponde
 * e alla fine restituisce un 500 generico senza dettagli — verificato dal vivo: ~76s, poi
 * "Error id ...-1" senza altro. Dal punto di vista dell'utente l'animazione in admin resta ferma
 * sul passo "Verifica del Digital Link" per oltre un minuto e poi fallisce con un messaggio che
 * non spiega nulla — esattamente il "si blocca" segnalato più volte, distinto dal vero blocco già
 * risolto (route publish che rispondeva 502, vedi il commento su isColdStartError in
 * routes/dpp.ts): qui la richiesta a mock-eu-registry parte davvero e riceve davvero una
 * risposta, solo dopo un'attesa lunga quanto inutile, perché il fallimento è già certo PRIMA di
 * fare qualunque chiamata di rete (né questa né tantomeno quella ad Auth0, evitata anche lei).
 * Bloccarla qui trasforma quell'attesa in un errore immediato e comprensibile — non elimina il
 * limite strutturale in sé (serve comunque un SITE_URL pubblico, es. un tunnel ngrok, per
 * completare davvero una pubblicazione in locale, vedi docs/REGISTRY-SETUP.md §5), ma non lascia
 * più l'utente a fissare l'animazione per un minuto intero senza sapere perché. */
function assertSiteUrlReachableFromRegistry(siteUrl: string): void {
  let hostname: string;
  try {
    hostname = new URL(siteUrl).hostname;
  } catch {
    throw new Error(`SITE_URL non è un URL valido: "${siteUrl}".`);
  }
  const isLocalOrPrivate =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname);
  if (isLocalOrPrivate) {
    throw new Error(
      `mock-eu-registry (che gira nel cloud) non può raggiungere "${siteUrl}" per scaricare il liveURL e calcolarne l'hash — è un limite noto del test in locale (vedi docs/REGISTRY-SETUP.md §5), non un errore di configurazione. Serve un SITE_URL pubblicamente raggiungibile: il dominio reale in produzione, oppure un tunnel come ngrok puntato a questa macchina per provare in locale.`
    );
  }
}

/** Costruisce l'URL pubblico GS1 Digital Link della scheda — stesso pattern già usato dal
 * resto del sito per le pagine prodotto (`/01/{gtin}`, vedi src/app/pages/product), con
 * l'eventuale AI (10) lotto o (21) seriale in coda (`/01/{gtin}/10/{lotto}` o
 * `/01/{gtin}/21/{seriale}`, sintassi standard GS1 Digital Link) quando presente — le route
 * `01/:gtin/10/:batch` e `01/:gtin/21/:serial` in app.routes.ts risolvono anche queste.
 *
 * ATTENZIONE per lo sviluppo locale: mock-eu-registry scarica davvero questo URL per calcolarne
 * l'hash (dppHash/dppContentType nella risposta) — verificato empiricamente. Se SITE_URL punta a
 * localhost, la richiesta fallisce dal lato di mock-eu-registry (che gira nel cloud e non può
 * raggiungere la tua macchina): la pubblicazione in locale funziona solo con un SITE_URL
 * pubblicamente raggiungibile (il dominio reale in produzione, o un tunnel tipo ngrok in test). */
function digitalLinkUrl(siteUrl: string, gtin: string, ai?: '10' | '21', value?: string): string {
  const base = `${siteUrl.replace(/\/$/, '')}/01/${gtin}`;
  return ai && value ? `${base}/${ai}/${encodeURIComponent(value)}` : base;
}

/** Interpreta il campo libero "lotto o seriale" del form: AI (21) esplicito, o livello ITEM
 * senza prefisso, è un seriale; altrimenti è un lotto (AI 10) — stessa euristica già usata per
 * il JSON-LD, vedi jsonld.ts. */
function parseBatchOrSerial(batchOrSerial: string, granularityLevel: GranularityLevel): { ai: '10' | '21'; value: string } {
  const value = batchOrSerial.replace(/^\(\d{2}\)\s*/, '').trim();
  const ai = /^\(21\)/.test(batchOrSerial) || granularityLevel === 'ITEM' ? '21' : '10';
  return { ai, value };
}

/** upi/modelUpi/batchUpi come URI GS1 Digital Link veri — non il GTIN nudo. Lo schema di
 * mock-eu-registry (default-schema.json) non impone un `format`/`pattern` su questi campi, ma
 * il suo stesso esempio è un URI (`"urn:epc:id:sgtin:..."`, la serializzazione EPC dello stesso
 * concetto): un identificativo che non risolve a nulla non è conforme allo spirito dello
 * standard, anche se il validatore lo accetterebbe. GS1 Digital Link è uno degli schemi di
 * identificativo esplicitamente previsti per il DPP (insieme a EPC URN, UUID, DID) ed è quello
 * che questo intero progetto risolve davvero — coerente con liveURL, che usa la stessa sintassi. */
function buildUpi(siteUrl: string, record: DppRecord): string {
  if (record.granularityLevel === 'MODEL' || !record.batchOrSerial) {
    return digitalLinkUrl(siteUrl, record.gtin);
  }
  const { ai, value } = parseBatchOrSerial(record.batchOrSerial, record.granularityLevel);
  return digitalLinkUrl(siteUrl, record.gtin, ai, value);
}

/** Campi di granularità richiesti dallo schema di mock-eu-registry — diversi per MODEL/BATCH/ITEM
 * (vedi il blocco `allOf` in default-schema.json, scaricato e riletto per verificarlo). Il
 * nostro modello dati non rappresenta una vera gerarchia modello→lotto→articolo (un solo GTIN
 * per scheda): modelUpi punta sempre all'URI "nudo" (senza AI), coerente con "un solo modello
 * per GTIN" anche se non tracciamo esplicitamente più schede collegate allo stesso modello. */
function granularityFields(siteUrl: string, record: DppRecord): Record<string, unknown> {
  const modelUpi = digitalLinkUrl(siteUrl, record.gtin);
  if (record.granularityLevel === 'MODEL') return {};
  if (record.granularityLevel === 'BATCH') return { modelUpi };
  // ITEM: modelUpi e deactivated obbligatori per schema. Lo schema scaricato da GitHub
  // dichiara batchUpi facoltativo per ITEM, ma l'istanza live pubblicata lo rifiuta come
  // mancante se omesso — verificato con una richiesta reale, HTTP 400 "$: required property
  // 'batchUpi' not found": la sua immagine Docker (:latest) evidentemente non è allineata al
  // branch main del repo. Lo includiamo perciò sempre, riusando il lotto/seriale del form (o
  // il GTIN nudo come URI degenere se non specificato) — il comportamento verificato conta più
  // di quello scritto nello schema quando i due divergono.
  const value = record.batchOrSerial ? parseBatchOrSerial(record.batchOrSerial, 'BATCH').value : record.gtin;
  return {
    modelUpi,
    deactivated: false,
    batchUpi: digitalLinkUrl(siteUrl, record.gtin, '10', value),
  };
}

/** Ping "fire and forget" verso mock-eu-registry, sullo stesso endpoint pubblico /q/health già
 * usato dalla GitHub Action di risveglio — nessun token Auth0 richiesto, non è una vera
 * chiamata applicativa. Usato per risvegliare in anticipo il container Render quando si apre
 * la sezione admin (vedi routes 'warmup' qui sotto e Admin in admin.ts), prima che un publish()
 * vero lo richieda — così l'attesa del risveglio è già in corso mentre l'utente compila il
 * form, invece di iniziare solo al click su "Pubblica". Non lancia mai: un fallimento qui non
 * deve interrompere nulla, il retry vero resta quello di registerDpp()/TransientRegistryError. */
export function pingMockRegistry(): void {
  const registryUrl = process.env.MOCK_EU_REGISTRY_URL;
  if (!registryUrl) return;
  fetch(`${registryUrl.replace(/\/$/, '')}/q/health`).catch(() => {});
}

export async function registerDpp(record: DppRecord): Promise<RegistrationResult> {
  const config = requiredConfig();
  const siteUrl = process.env.SITE_URL || 'http://localhost:4200';
  assertSiteUrlReachableFromRegistry(siteUrl);
  const token = await fetchAccessToken(config);
  const liveUrl = digitalLinkUrl(siteUrl, record.gtin);

  const requestBody = {
    upi: buildUpi(siteUrl, record),
    // Compilato dall'utente nel form admin (colonna economic_operator_id, vedi db.ts) — non più
    // una costante fissa: non abbiamo comunque un modello multi-tenant reale (un solo cancello
    // password per tutto l'admin, vedi auth.ts), ma almeno il valore inviato è quello che
    // l'operatore ha davvero dichiarato, non un segnaposto uguale per ogni scheda.
    reoId: record.economicOperatorId,
    liveURL: liveUrl,
    backupURL: liveUrl,
    commodityCode: COMMODITY_CODES[record.sectorId],
    facilitiesId: [record.facilityId],
    granularityLevel: record.granularityLevel,
    ...granularityFields(siteUrl, record),
  };

  let registerResponse: Response;
  try {
    registerResponse = await fetch(`${config.registryUrl}/metadata/v1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(REGISTER_TIMEOUT_MS),
    });
  } catch (err) {
    if (isAbortOrTimeout(err)) {
      throw new TransientRegistryError(`mock-eu-registry non ha risposto entro ${REGISTER_TIMEOUT_MS / 1000}s.`);
    }
    throw err;
  }
  if (!registerResponse.ok) {
    if ([429, 502, 503, 504].includes(registerResponse.status)) {
      const suffix = registerResponse.status === 429 ? retryAfterSuffix(registerResponse) : '';
      throw new TransientRegistryError(`${await registerResponse.text()}${suffix}`);
    }
    throw new Error(`Registrazione rifiutata da mock-eu-registry (${registerResponse.status}): ${await registerResponse.text()}`);
  }
  const registered = (await registerResponse.json()) as { registryId: string } & Record<string, unknown>;

  return {
    registryId: registered.registryId,
    proofJwt: await tryFetchProof(config, token, registered.registryId),
    request: requestBody,
    response: registered,
  };
}

/** La "proof of registration" è un bonus, non la conferma della registrazione stessa (quella è
 * già certificata dal registryId ottenuto sopra): se il suo recupero fallisce non deve far
 * fallire la pubblicazione. Verificato contro l'istanza live che questo endpoint può restituire
 * 404 anche subito dopo una registrazione riuscita con lo stesso registryId — comportamento non
 * spiegato nei log disponibili, trattato qui come "proof non disponibile", non come errore. */
async function tryFetchProof(config: ReturnType<typeof requiredConfig>, token: string, registryId: string): Promise<string | null> {
  try {
    const proofResponse = await fetch(`${config.registryUrl}/metadata/v1/${registryId}/proof`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(PROOF_TIMEOUT_MS),
    });
    if (!proofResponse.ok) {
      console.warn(`mock-eu-registry: proof non disponibile per ${registryId} (${proofResponse.status})`);
      return null;
    }
    return await proofResponse.text();
  } catch (err) {
    console.warn(`mock-eu-registry: richiesta della proof fallita per ${registryId}:`, err);
    return null;
  }
}
