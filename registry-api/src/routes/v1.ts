import { Router } from 'express';
import { createDpp, deleteDpp, findByIdentity, getDpp, getPublishedByGtin, updateDpp, type DppRecord, type GranularityLevel } from '../db.ts';
import { dppToJsonLd } from '../jsonld.ts';
import { requireAuth } from '../auth.ts';
import { isValidSectorId, type SectorId } from '../sectors.ts';

/**
 * Superficie REST conforme a EN 18222:2026 §5 (Main Methods) — docs/dpp-api-specification.md
 * §3, verificata metodo per metodo contro quel documento, path e nomi compresi. Affianca, senza
 * sostituirle, le rotte interne già esistenti (routes/dpp.ts, sotto /registry-api/dpp): quelle
 * restano il contratto con cui l'admin di QUESTO sito crea/modifica un DPP (un solo campo UPI,
 * niente utenti terzi da autenticare) — non hanno mai preteso di essere "l'API dello standard",
 * solo lo strumento interno con cui questo sito popola il proprio database. Questa qui sotto è
 * invece la superficie che un sistema ESTERNO (un altro DPP service provider, un integratore, un
 * validatore di conformità) troverebbe seguendo alla lettera EN 18222 — payload in ingresso e
 * uscita nella forma esatta di EN 18223 §4.1.2.1 (dpp-payload.schema.json, §6.1 del documento),
 * non nel formato interno semplificato (DppInput) che usa il resto di questo servizio.
 *
 * Sicurezza (EN 18239, §7.1 del documento): le letture sono pubbliche e senza autenticazione,
 * ma SOLO su schede già pubblicate — un DPP ancora in bozza non è "dato pubblico" finché non
 * pubblicato, coerente con getPublishedByGtin già usato altrove (routes/public.ts). Scrittura
 * (Create/Update/Delete) autenticata con lo stesso cancello a cookie dell'admin (auth.ts): non
 * abbiamo un vero modello multi-tenant "service provider" con credenziali Auth0/eIDAS separate
 * (esplicitamente fuori scope per questa demo), quindi qui "terza parte autorizzata" coincide
 * con "l'unico admin che già gestisce questo sito" — la spec userebbe `Authorization: Bearer
 * <token>` (OAuth2/OIDC), noi il cookie di sessione già in uso: stesso concetto (autenticazione
 * di un attore autorizzato), meccanismo di trasporto diverso.
 *
 * Non implementato, e dichiarato tale invece di far finta: §5 (Fine Granular API, RFC 9535
 * JSONPath) — nessun campo del nostro modello dati è abbastanza grande da giustificare
 * un'interfaccia di lettura/scrittura "chirurgica" per singolo campo, in una demo con poche
 * decine di schede al più.
 */
export const v1Router = Router();

/** Estrae GTIN + AI qualificatore (10/21) da un URI GS1 Digital Link (uniqueProductIdentifier o
 * productId) — stesso pattern con cui questo stesso servizio COSTRUISCE quegli URI altrove
 * (digitalLinkUrl in jsonld.ts/mockRegistryClient.ts), qui percorso all'indietro. Un'espressione
 * regolare basta: analizziamo solo URI che abbiamo generato noi stessi (o che rispettano la
 * stessa identica sintassi), non input arbitrario da terzi — per quello servirebbe il GS1
 * Barcode Syntax Engine vero, disponibile solo lato Angular (vedi utils/gs1-digital-link.ts),
 * non ancora lato registry-api. */
function parseProductIdentifier(value: string): { gtin: string; granularityLevel: GranularityLevel; batchOrSerial: string | null } | null {
  const match = /\/01\/(\d{8,14})(?:\/(10|21)\/([^/?#]+))?/.exec(value);
  if (!match) return null;
  const [, gtin, ai, rawValue] = match;
  if (!ai || !rawValue) return { gtin, granularityLevel: 'MODEL', batchOrSerial: null };
  const value_ = decodeURIComponent(rawValue);
  return { gtin, granularityLevel: ai === '21' ? 'ITEM' : 'BATCH', batchOrSerial: `(${ai}) ${value_}` };
}

function siteUrl(): string {
  return process.env.SITE_URL || 'http://localhost:4200';
}

/** dppId in ingresso può arrivare come UUID nudo o come l'intero digitalProductPassportId
 * ("urn:uuid:<uuid>", il valore esatto che questo stesso servizio assegna — vedi jsonld.ts):
 * accettiamo entrambi invece di imporre all'esterno di conoscere la nostra convenzione interna. */
function normalizeDppId(raw: string | string[]): string {
  return String(raw).replace(/^urn:uuid:/, '');
}

// ---------------------------------------------------------------------------
// 3.1 GET /v1/dpps/{dppId} — ReadDPPById (Obbligatorio)
// ---------------------------------------------------------------------------
v1Router.get('/dpps/:dppId', async (req, res) => {
  const record = await getDpp(normalizeDppId(req.params.dppId));
  // "o filtrato in base ai diritti d'accesso" (§3.1): qui il filtro è binario, non granulare —
  // pubblicata è pubblica, bozza non esiste per chi non è autenticato (vedi il commento in cima
  // al file sul perché non implementiamo Bearer/OIDC per questa lettura).
  if (!record || record.status !== 'published') {
    res.status(404).json({ error: 'nessun DPP pubblicato con questo identificativo' });
    return;
  }
  // "representation=compressed|full" (§3.1): questa demo produce un solo formato — lo stesso
  // per entrambi i valori, invece di implementare l'Allegato A (rappresentazione estesa) che EN
  // 18223 lascia comunque facoltativo per un service provider.
  res.type('application/ld+json').json(dppToJsonLd(record, siteUrl()));
});

// ---------------------------------------------------------------------------
// 3.2 GET /v1/dppsByProductId/{productId} — ReadDPPByProductId (Obbligatorio)
// ---------------------------------------------------------------------------
v1Router.get('/dppsByProductId/:productId', async (req, res) => {
  const parsed = parseProductIdentifier(decodeURIComponent(req.params.productId));
  if (!parsed) {
    res.status(404).json({ error: 'productId non è un URI GS1 Digital Link riconoscibile' });
    return;
  }
  const record = await getPublishedByGtin(parsed.gtin);
  if (!record) {
    res.status(404).json({ error: 'nessun DPP attivo per questo identificativo di prodotto' });
    return;
  }
  res.type('application/ld+json').json(dppToJsonLd(record, siteUrl()));
});

// ---------------------------------------------------------------------------
// 3.3 GET /v1/dppsByIdAndDate/{dppId} — ReadDPPVersionByIdAndDate (Raccomandato)
// ---------------------------------------------------------------------------
v1Router.get('/dppsByIdAndDate/:dppId', async (req, res) => {
  const dateParam = req.query.date;
  if (typeof dateParam !== 'string' || Number.isNaN(Date.parse(dateParam))) {
    res.status(400).json({ error: 'query param "date" obbligatorio, timestamp ISO 8601 UTC' });
    return;
  }
  const record = await getDpp(normalizeDppId(req.params.dppId));
  if (!record || record.status !== 'published') {
    res.status(404).json({ error: 'nessun DPP pubblicato con questo identificativo' });
    return;
  }
  // Limite dichiarato: questo servizio non tiene uno storico delle versioni (EN 18221, mai
  // implementato in questa demo — vedi la nota di sicurezza/tracciabilità in cima al file). C'è
  // sempre e solo la versione corrente: la restituiamo se la data richiesta cade dopo la sua
  // creazione (l'unica versione "valida" a quella data sarebbe stata questa), altrimenti 404 —
  // onesto sul non avere nulla da restituire, invece di fingere una versione che non abbiamo mai
  // conservato.
  if (Date.parse(dateParam) < Date.parse(record.createdAt)) {
    res.status(404).json({ error: 'nessuna versione esisteva a questa data — questo servizio non conserva uno storico, solo la versione corrente' });
    return;
  }
  res.type('application/ld+json').json(dppToJsonLd(record, siteUrl()));
});

// ---------------------------------------------------------------------------
// 3.4 POST /v1/dppsByProductIds — ReadDPPIdsByProductIds (Obbligatorio)
// ---------------------------------------------------------------------------
interface BulkLookupBody {
  productIds?: unknown;
  limit?: unknown;
  cursor?: string;
}

v1Router.post('/dppsByProductIds', async (req, res) => {
  const body = req.body as BulkLookupBody;
  if (!Array.isArray(body.productIds) || body.productIds.some((v) => typeof v !== 'string')) {
    res.status(400).json({ error: 'productIds deve essere un array di stringhe' });
    return;
  }
  const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 200) : 50;
  const offset = body.cursor ? Number(Buffer.from(body.cursor, 'base64url').toString('utf8')) || 0 : 0;

  const productIds = body.productIds as string[];
  const page = productIds.slice(offset, offset + limit);
  const dppIds: string[] = [];
  for (const productId of page) {
    const parsed = parseProductIdentifier(productId);
    if (!parsed) continue;
    const record = await getPublishedByGtin(parsed.gtin);
    if (record) dppIds.push(`urn:uuid:${record.id}`);
  }
  const nextOffset = offset + limit;
  const nextCursor = nextOffset < productIds.length ? Buffer.from(String(nextOffset), 'utf8').toString('base64url') : null;
  res.json({ dppIds, nextCursor });
});

// ---------------------------------------------------------------------------
// 3.5 POST /v1/dpps — CreateDPP (Raccomandato per Service Provider)
// ---------------------------------------------------------------------------
interface DppPayloadBody {
  uniqueProductIdentifier?: unknown;
  name?: unknown;
  attributes?: unknown; // scorciatoia nostra, alternativa a schema:additionalProperty (vedi sotto)
  'schema:additionalProperty'?: unknown;
  economicOperatorId?: unknown;
  facilityId?: unknown;
}

/** schema:additionalProperty (schema.org PropertyValue, §6.1/jsonld.ts) O, in alternativa più
 * comoda per chi integra senza passare dal JSON-LD completo, un oggetto piatto `attributes`:
 * entrambi finiscono nello stesso posto internamente. additionalProperties:true nello schema
 * (§6.1) permette entrambe le forme, nessuna delle due è "quella sbagliata". */
function extractAttributes(body: DppPayloadBody): Record<string, string> {
  if (body.attributes && typeof body.attributes === 'object' && !Array.isArray(body.attributes)) {
    return body.attributes as Record<string, string>;
  }
  const prop = body['schema:additionalProperty'];
  if (Array.isArray(prop)) {
    const out: Record<string, string> = {};
    for (const entry of prop) {
      if (entry && typeof entry === 'object' && typeof entry.name === 'string') out[entry.name] = String(entry.value ?? '');
    }
    return out;
  }
  return {};
}

v1Router.post('/dpps', requireAuth, async (req, res) => {
  const body = req.body as DppPayloadBody;
  if (typeof body.uniqueProductIdentifier !== 'string') {
    res.status(400).json({ error: 'uniqueProductIdentifier obbligatorio (URI GS1 Digital Link)' });
    return;
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    res.status(400).json({ error: 'name obbligatorio' });
    return;
  }
  const parsed = parseProductIdentifier(body.uniqueProductIdentifier);
  if (!parsed) {
    res.status(400).json({ error: 'uniqueProductIdentifier non è un URI GS1 Digital Link riconoscibile (atteso .../01/<gtin>[/10|21/<valore>])' });
    return;
  }
  // sectorId: non è un campo dello schema EN 18223 (contentSpecificationIds non basta a
  // distinguerlo — 8 dei 9 settori demo condividono lo stesso atto delegato ESPR, vedi
  // src/app/data/sectors.ts#contentSpecificationId) — query param invece di un'estensione nel
  // body, così il corpo della richiesta resta ESATTAMENTE lo schema §6.1, senza campi nostri
  // mescolati dentro.
  const sectorId = req.query.sectorId;
  if (!isValidSectorId(sectorId)) {
    res.status(400).json({ error: 'query param "sectorId" obbligatorio e valido (vedi src/sectors.ts)' });
    return;
  }
  // 409, non un duplicato silenzioso — stesso comportamento di un'implementazione di
  // riferimento reale (vedi il commento su findByIdentity in db.ts).
  const duplicate = await findByIdentity(parsed.gtin, parsed.granularityLevel, parsed.batchOrSerial);
  if (duplicate) {
    res.status(409).json({ error: 'un DPP con questo identificativo di prodotto esiste già', digitalProductPassportId: `urn:uuid:${duplicate.id}` });
    return;
  }
  const record = await createDpp({
    sectorId: sectorId as SectorId,
    gtin: parsed.gtin,
    name: body.name.trim(),
    granularityLevel: parsed.granularityLevel,
    batchOrSerial: parsed.batchOrSerial,
    attributes: extractAttributes(body),
    // economicOperatorId/facilityId (§6.1, il primo obbligatorio nello schema): letti dal body
    // se il chiamante li manda (un chiamante esterno che segue lo standard alla lettera lo fa),
    // altrimenti createDpp() ricade sul valore demo — vedi FALLBACK_* in db.ts. Non un 400 se
    // mancante: renderlo bloccante qui romperebbe un client che invia solo i campi che questa
    // rotta richiedeva finora.
    economicOperatorId: typeof body.economicOperatorId === 'string' ? body.economicOperatorId : undefined,
    facilityId: typeof body.facilityId === 'string' ? body.facilityId : undefined,
  });
  res.status(201).json({ statusCode: 'SuccessCreated', digitalProductPassportId: `urn:uuid:${record.id}` });
});

// ---------------------------------------------------------------------------
// 3.6 PATCH /v1/dpps/{dppId} — UpdateDPPById (Obbligatorio per terze parti autorizzate)
// ---------------------------------------------------------------------------
/** RFC 7396 JSON Merge Patch: solo le chiavi presenti nel corpo della richiesta vengono
 * aggiornate, le altre restano quelle già salvate — non un PUT che sostituisce tutto. Qui si
 * applica ai soli campi che il nostro modello interno rappresenta davvero (vedi CreateDPP sopra
 * per il perché altri campi dello schema, come dppStatus, non sono scrivibili da qui: lo stato
 * pubblicato/bozza lo decide solo publish(), vedi routes/dpp.ts, non un PATCH generico). */
v1Router.patch('/dpps/:dppId', requireAuth, async (req, res) => {
  const id = normalizeDppId(req.params.dppId);
  const existing = await getDpp(id);
  if (!existing) {
    res.status(404).json({ error: 'nessun DPP con questo identificativo' });
    return;
  }
  if (existing.status === 'published') {
    res.status(409).json({ error: 'un DPP già pubblicato non è modificabile in questa demo' });
    return;
  }
  const body = req.body as DppPayloadBody;
  const patch: Parameters<typeof updateDpp>[1] = {};

  if (body.uniqueProductIdentifier !== undefined) {
    if (typeof body.uniqueProductIdentifier !== 'string') {
      res.status(400).json({ error: 'uniqueProductIdentifier deve essere una stringa' });
      return;
    }
    const parsed = parseProductIdentifier(body.uniqueProductIdentifier);
    if (!parsed) {
      res.status(400).json({ error: 'uniqueProductIdentifier non è un URI GS1 Digital Link riconoscibile' });
      return;
    }
    patch.gtin = parsed.gtin;
    patch.granularityLevel = parsed.granularityLevel;
    patch.batchOrSerial = parsed.batchOrSerial;
  }
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      res.status(400).json({ error: 'name non può essere vuoto' });
      return;
    }
    patch.name = body.name.trim();
  }
  if (body.attributes !== undefined || body['schema:additionalProperty'] !== undefined) {
    patch.attributes = extractAttributes(body);
  }
  if (body.economicOperatorId !== undefined) {
    if (typeof body.economicOperatorId !== 'string' || !body.economicOperatorId.trim()) {
      res.status(400).json({ error: 'economicOperatorId non può essere vuoto' });
      return;
    }
    patch.economicOperatorId = body.economicOperatorId.trim();
  }
  if (body.facilityId !== undefined) {
    if (typeof body.facilityId !== 'string' || !body.facilityId.trim()) {
      res.status(400).json({ error: 'facilityId non può essere vuoto' });
      return;
    }
    patch.facilityId = body.facilityId.trim();
  }
  if (typeof req.query.sectorId === 'string') {
    if (!isValidSectorId(req.query.sectorId)) {
      res.status(400).json({ error: 'query param "sectorId" non valido' });
      return;
    }
    patch.sectorId = req.query.sectorId as SectorId;
  }

  const updated = (await updateDpp(id, patch)) as DppRecord;
  res.type('application/ld+json').json(dppToJsonLd(updated, siteUrl()));
});

// ---------------------------------------------------------------------------
// 3.7 DELETE /v1/dpps/{dppId} — DeleteDPPById (Raccomandato)
// ---------------------------------------------------------------------------
v1Router.delete('/dpps/:dppId', requireAuth, async (req, res) => {
  const id = normalizeDppId(req.params.dppId);
  const existing = await getDpp(id);
  if (!existing) {
    res.status(404).json({ error: 'nessun DPP con questo identificativo' });
    return;
  }
  // Stessa regola di routes/dpp.ts#DELETE /dpp/:id (vedi lì per il perché): un DPP registrato
  // non ha, nella realtà, un'operazione di cancellazione — solo una futura "deactivated".
  if (existing.status === 'published') {
    res.status(409).json({ error: 'un DPP già pubblicato non è eliminabile in questa demo' });
    return;
  }
  await deleteDpp(id);
  res.status(204).end();
});
