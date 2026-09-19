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
  const response = await fetch(`https://${config.auth0Domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      audience: config.audience,
    }),
  });
  if (!response.ok) {
    throw new Error(`Auth0 non ha rilasciato un token (${response.status}): ${await response.text()}`);
  }
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
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

export async function registerDpp(record: DppRecord): Promise<RegistrationResult> {
  const config = requiredConfig();
  const siteUrl = process.env.SITE_URL || 'http://localhost:4200';
  const token = await fetchAccessToken(config);
  const liveUrl = digitalLinkUrl(siteUrl, record.gtin);

  const requestBody = {
    upi: buildUpi(siteUrl, record),
    // Identificativo demo dell'operatore economico — non abbiamo ancora un modello
    // multi-tenant reale, vedi "Esplicitamente fuori scope" nel piano di progetto.
    reoId: 'gs1-italy-dpp-demo',
    liveURL: liveUrl,
    backupURL: liveUrl,
    commodityCode: COMMODITY_CODES[record.sectorId],
    facilitiesId: ['gs1-italy-dpp-demo-facility'],
    granularityLevel: record.granularityLevel,
    ...granularityFields(siteUrl, record),
  };

  const registerResponse = await fetch(`${config.registryUrl}/metadata/v1`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(requestBody),
  });
  if (!registerResponse.ok) {
    if ([502, 503, 504].includes(registerResponse.status)) {
      throw new TransientRegistryError(await registerResponse.text());
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
