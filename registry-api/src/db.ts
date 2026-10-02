import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { SectorId } from './sectors.ts';

export type GranularityLevel = 'MODEL' | 'BATCH' | 'ITEM';
export type DppStatus = 'draft' | 'published';

export interface DppRecord {
  id: string;
  sectorId: SectorId;
  gtin: string;
  name: string;
  granularityLevel: GranularityLevel;
  batchOrSerial: string | null;
  /** Attributi liberi di prodotto, nidificati per categoria (collezione → chiave → valore) — i
   * settori non hanno ancora uno schema dati proprio. La categoria è una DataElementCollection
   * (diagramma UML, FprEN 18223) che collega la classe astratta DataElement alla classe
   * principale DigitalProductPassport: non più chiavi piatte alla radice del documento (vedi
   * jsonld.ts#dppToJsonLd). Chiavi tipiche: vedi linkTypes.ts#AttributeLinkTypeId
   * (sustainabilityInfo/certificationInfo/safetyInfo/instructions/masterData), ma qualunque
   * stringa è accettata — un chiamante esterno può usare un proprio nome di collezione. */
  attributes: Record<string, Record<string, string>>;
  status: DppStatus;
  createdAt: string;
  updatedAt: string;
  registryId: string | null;
  proofJwt: string | null;
  registeredAt: string | null;
  /** Identificativo dell'operatore economico che immette il prodotto sul mercato — campo
   * obbligatorio, compilato dall'utente nel form admin come URI GS1 Digital Link con GLN (vedi
   * utils/gs1-digital-link.ts lato frontend). NOT NULL con default demo per compatibilità con le
   * righe create prima di questa colonna. */
  economicOperatorId: string;
  /** Identificativo dello stabilimento che produce il prodotto — facoltativo per lo standard, ma
   * qui NOT NULL con default demo per lo stesso motivo di economicOperatorId sopra E perché
   * mock-eu-registry (vedi mockRegistryClient.ts) richiede sempre facilitiesId nel payload di
   * registrazione: lasciarlo vuoto romperebbe una pubblicazione vera. */
  facilityId: string;
  /** true solo per i 10 DPP di esempio del carosello della home (creati da seed.ts, stessi GTIN
   * di src/app/data/sectors.ts): non modificabili né eliminabili da /admin, perché la home li
   * linka come "scansionabili" — cancellarli o alterarli romperebbe quegli esempi per chiunque li
   * apra. Ogni altro DPP creato da un utente vero resta libero. Applicato dalle rotte
   * (routes/dpp.ts, routes/v1.ts), non qui: questo modulo resta un semplice accesso ai dati. */
  isStatic: boolean;
}

/** Riga così com'è restituita da Postgres (snake_case, timestamp come Date). */
interface DppRow {
  id: string;
  sector_id: string;
  gtin: string;
  name: string;
  granularity_level: string;
  batch_or_serial: string | null;
  attributes: Record<string, unknown>;
  status: string;
  created_at: Date;
  updated_at: Date;
  registry_id: string | null;
  proof_jwt: string | null;
  registered_at: Date | null;
  economic_operator_id: string;
  facility_id: string;
  is_static: boolean;
}

/** Postgres condiviso con mock-eu-registry (stesso progetto Supabase, tabella separata —
 * vedi docs/REGISTRY-SETUP.md): un file locale (SQLite) non sopravvive ai riavvii dei piani
 * gratuiti di hosting (Render, tra gli altri, azzera il filesystem a ogni sleep/redeploy). */
const DATABASE_URL = process.env.REGISTRY_DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('REGISTRY_DATABASE_URL non impostata — vedi docs/REGISTRY-SETUP.md.');
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

await pool.query(`
  CREATE TABLE IF NOT EXISTS gs1_dpp_records (
    id UUID PRIMARY KEY,
    sector_id TEXT NOT NULL,
    gtin TEXT NOT NULL,
    name TEXT NOT NULL,
    granularity_level TEXT NOT NULL,
    batch_or_serial TEXT,
    attributes JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    registry_id TEXT,
    proof_jwt TEXT,
    registered_at TIMESTAMPTZ,
    economic_operator_id TEXT NOT NULL DEFAULT 'https://id.gs1.org/417/9521234000006',
    facility_id TEXT NOT NULL DEFAULT 'https://id.gs1.org/414/9521234000112',
    is_static BOOLEAN NOT NULL DEFAULT false
  )
`);
// Le colonne sopra sono arrivate dopo la prima CREATE TABLE — su un database già esistente
// (Render/Supabase in produzione, non ricreato da zero) CREATE TABLE IF NOT EXISTS non le
// aggiungerebbe da sola alle righe già presenti. ADD COLUMN IF NOT EXISTS con lo stesso default
// è idempotente: non fa nulla se la colonna c'è già (deploy successivi), la crea con lo stesso
// valore demo/false di sempre se manca (prima esecuzione dopo questo cambiamento).
await pool.query("ALTER TABLE gs1_dpp_records ADD COLUMN IF NOT EXISTS economic_operator_id TEXT NOT NULL DEFAULT 'https://id.gs1.org/417/9521234000006'");
await pool.query("ALTER TABLE gs1_dpp_records ADD COLUMN IF NOT EXISTS facility_id TEXT NOT NULL DEFAULT 'https://id.gs1.org/414/9521234000112'");
await pool.query('ALTER TABLE gs1_dpp_records ADD COLUMN IF NOT EXISTS is_static BOOLEAN NOT NULL DEFAULT false');
await pool.query('CREATE INDEX IF NOT EXISTS gs1_dpp_records_gtin_idx ON gs1_dpp_records (gtin)');
// Richiesta e risposta REALI scambiate con il DPP Registry UE alla registrazione (con gli
// identificativi assegnati): salvate per poterle rimostrare in qualunque momento, non solo
// nell'istante della pubblicazione. NULL per le schede registrate prima di questa colonna.
await pool.query('ALTER TABLE gs1_dpp_records ADD COLUMN IF NOT EXISTS registry_request JSONB');
await pool.query('ALTER TABLE gs1_dpp_records ADD COLUMN IF NOT EXISTS registry_response JSONB');
// Storico delle modifiche nel tempo (reali o simulate): un evento per modifica, con cosa è
// cambiato (prima/dopo) — alimenta la pagina gs1:traceability.
await pool.query(`
  CREATE TABLE IF NOT EXISTS gs1_dpp_events (
    id UUID PRIMARY KEY,
    dpp_id UUID NOT NULL,
    at TIMESTAMPTZ NOT NULL,
    scenario TEXT NOT NULL,
    simulated BOOLEAN NOT NULL DEFAULT true,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    changes JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);
await pool.query('CREATE INDEX IF NOT EXISTS gs1_dpp_events_dpp_idx ON gs1_dpp_events (dpp_id, at)');

/** Upgrade in lettura per righe scritte prima che gli attributi diventassero nidificati per
 * categoria (vedi DppRecord.attributes qui sopra): se il valore sotto la prima chiave è una
 * stringa invece che un oggetto, l'intero blob è ancora nella forma piatta precedente
 * (chiave → valore diretto) — avvolto qui in un'unica collezione "masterData" (lo stesso
 * ripiego di default di classifyAttribute() in linkTypes.ts) così il resto del
 * sistema vede sempre e solo la forma nidificata, senza dover distinguere le due in ogni punto
 * che legge attributes. Nessuna migrazione SQL necessaria: la colonna è JSONB, la forma del
 * contenuto non è vincolata dallo schema della tabella. */
function normalizeAttributes(raw: Record<string, unknown>): Record<string, Record<string, string>> {
  const firstValue = Object.values(raw)[0];
  if (firstValue !== undefined && typeof firstValue !== 'object') {
    return { masterData: raw as Record<string, string> };
  }
  return raw as Record<string, Record<string, string>>;
}

function fromRow(row: DppRow): DppRecord {
  return {
    id: row.id,
    sectorId: row.sector_id as SectorId,
    gtin: row.gtin,
    name: row.name,
    granularityLevel: row.granularity_level as GranularityLevel,
    batchOrSerial: row.batch_or_serial,
    attributes: normalizeAttributes(row.attributes),
    status: row.status as DppStatus,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    registryId: row.registry_id,
    proofJwt: row.proof_jwt,
    registeredAt: row.registered_at ? row.registered_at.toISOString() : null,
    economicOperatorId: row.economic_operator_id,
    facilityId: row.facility_id,
    isStatic: row.is_static,
  };
}

export async function listDpp(): Promise<DppRecord[]> {
  const { rows } = await pool.query<DppRow>('SELECT * FROM gs1_dpp_records ORDER BY updated_at DESC');
  return rows.map(fromRow);
}

export async function getDpp(id: string): Promise<DppRecord | undefined> {
  const { rows } = await pool.query<DppRow>('SELECT * FROM gs1_dpp_records WHERE id = $1', [id]);
  return rows[0] ? fromRow(rows[0]) : undefined;
}

/** Lettura pubblica (senza auth, vedi routes/public.ts) per le pagine prodotto `/01/:gtin`:
 * solo schede pubblicate — una bozza non è dato da mostrare a chi scansiona il prodotto. Se più
 * schede condividono lo stesso GTIN (varianti di lotto/seriale), quella pubblicata più di recente. */
export async function getPublishedByGtin(gtin: string): Promise<DppRecord | undefined> {
  const { rows } = await pool.query<DppRow>(
    "SELECT * FROM gs1_dpp_records WHERE gtin = $1 AND status = 'published' ORDER BY registered_at DESC LIMIT 1",
    [gtin]
  );
  return rows[0] ? fromRow(rows[0]) : undefined;
}

/** Qualunque scheda con questo GTIN, bozza compresa — solo per il JSON-LD servito a
 * mock-eu-registry durante la registrazione (vedi routes/public.ts): il registro scarica il
 * liveURL PRIMA di confermare la registrazione, quando la scheda presso di noi è ancora
 * 'draft' (markPublished gira solo dopo la sua risposta) — filtrare qui su status='published'
 * causerebbe lo stesso 404 già risolto una volta (vedi commit "Non bloccare mock-eu-registry
 * sulla content negotiation JSON-LD"). Non esposta come lettura pubblica generica altrove. */
export async function getAnyByGtin(gtin: string): Promise<DppRecord | undefined> {
  const { rows } = await pool.query<DppRow>('SELECT * FROM gs1_dpp_records WHERE gtin = $1 ORDER BY updated_at DESC LIMIT 1', [gtin]);
  return rows[0] ? fromRow(rows[0]) : undefined;
}

/** Stesso identificativo di prodotto esatto (GTIN + eventuale AI (10)/(21)), non solo lo stesso
 * GTIN — usata da routes/v1.ts#POST /dpps (CreateDPP) per il 409 Conflict su una ricreazione,
 * verificato contro il comportamento reale di un'implementazione di riferimento
 * (eclipse-basyx/basyx-go-components, esempio BaSyxDPPAPIExample): creare due volte lo stesso
 * passaporto deve fallire, non produrre un duplicato silenzioso. Un MODEL e un BATCH/ITEM con lo
 * stesso GTIN restano identità di prodotto distinte (granularità diversa) e non collidono qui —
 * a differenza di getAnyByGtin()/getPublishedByGtin(), pensate apposta per "una riga qualunque
 * con questo GTIN", non per un confronto di identità esatta. */
export async function findByIdentity(gtin: string, granularityLevel: GranularityLevel, batchOrSerial: string | null): Promise<DppRecord | undefined> {
  const { rows } = await pool.query<DppRow>(
    'SELECT * FROM gs1_dpp_records WHERE gtin = $1 AND granularity_level = $2 AND batch_or_serial IS NOT DISTINCT FROM $3 ORDER BY updated_at DESC LIMIT 1',
    [gtin, granularityLevel, batchOrSerial]
  );
  return rows[0] ? fromRow(rows[0]) : undefined;
}

export interface CreateDppInput {
  sectorId: SectorId;
  gtin: string;
  name: string;
  granularityLevel: GranularityLevel;
  batchOrSerial?: string | null;
  attributes?: Record<string, Record<string, string>>;
  /** Obbligatorio per lo standard, facoltativo qui (default demo se omesso) per non rompere i
   * chiamanti esistenti (routes/v1.ts) scritti prima di questa colonna. */
  economicOperatorId?: string;
  facilityId?: string;
  /** Solo seed.ts la passa true, per i 10 esempi del carosello home — vedi il commento su
   * DppRecord.isStatic sopra. Ogni altro chiamante (routes/dpp.ts, routes/v1.ts) la lascia
   * implicita (false): un DPP creato da un utente vero non è mai statico. */
  isStatic?: boolean;
}

/** Stessi due valori demo del default NOT NULL della colonna (vedi CREATE TABLE/ADD COLUMN più
 * sopra) — ripetuti qui in JS perché "DEFAULT" come parola chiave SQL può comparire solo come
 * intero elemento di una VALUES list, non dentro un'espressione come COALESCE($n, DEFAULT). */
const FALLBACK_ECONOMIC_OPERATOR_ID = 'https://id.gs1.org/417/9521234000006';
const FALLBACK_FACILITY_ID = 'https://id.gs1.org/414/9521234000112';

export async function createDpp(input: CreateDppInput): Promise<DppRecord> {
  const id = randomUUID();
  const { rows } = await pool.query<DppRow>(
    `INSERT INTO gs1_dpp_records (id, sector_id, gtin, name, granularity_level, batch_or_serial, attributes, economic_operator_id, facility_id, is_static)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      id,
      input.sectorId,
      input.gtin,
      input.name,
      input.granularityLevel,
      input.batchOrSerial ?? null,
      JSON.stringify(input.attributes ?? {}),
      input.economicOperatorId ?? FALLBACK_ECONOMIC_OPERATOR_ID,
      input.facilityId ?? FALLBACK_FACILITY_ID,
      input.isStatic ?? false,
    ]
  );
  return fromRow(rows[0]);
}

/** isStatic esclusa apposta: non è un campo che un aggiornamento possa cambiare (vedi
 * DppRecord.isStatic) — assegnata una sola volta, alla creazione. */
export type UpdateDppInput = Partial<Omit<CreateDppInput, 'isStatic'>>;

export async function updateDpp(id: string, input: UpdateDppInput): Promise<DppRecord | undefined> {
  const existing = await getDpp(id);
  if (!existing) return undefined;

  const merged = {
    sectorId: input.sectorId ?? existing.sectorId,
    gtin: input.gtin ?? existing.gtin,
    name: input.name ?? existing.name,
    granularityLevel: input.granularityLevel ?? existing.granularityLevel,
    batchOrSerial: input.batchOrSerial !== undefined ? input.batchOrSerial : existing.batchOrSerial,
    attributes: input.attributes ?? existing.attributes,
    economicOperatorId: input.economicOperatorId ?? existing.economicOperatorId,
    facilityId: input.facilityId ?? existing.facilityId,
  };
  const { rows } = await pool.query<DppRow>(
    `UPDATE gs1_dpp_records SET
      sector_id = $2, gtin = $3, name = $4, granularity_level = $5,
      batch_or_serial = $6, attributes = $7, economic_operator_id = $8, facility_id = $9, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      merged.sectorId,
      merged.gtin,
      merged.name,
      merged.granularityLevel,
      merged.batchOrSerial,
      JSON.stringify(merged.attributes),
      merged.economicOperatorId,
      merged.facilityId,
    ]
  );
  return rows[0] ? fromRow(rows[0]) : undefined;
}

export async function deleteDpp(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM gs1_dpp_records WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/** Segna la scheda come pubblicata, dopo una registrazione riuscita su mock-eu-registry. */
export async function markPublished(id: string, registryId: string, proofJwt: string | null): Promise<DppRecord | undefined> {
  const { rows } = await pool.query<DppRow>(
    `UPDATE gs1_dpp_records SET status = 'published', registry_id = $2, proof_jwt = $3, registered_at = now(), updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, registryId, proofJwt]
  );
  return rows[0] ? fromRow(rows[0]) : undefined;
}


/** Richiesta/risposta scambiate con il registro UE alla registrazione — vedi le colonne sopra. */
export async function saveRegistryTrace(id: string, request: unknown, response: unknown): Promise<void> {
  await pool.query('UPDATE gs1_dpp_records SET registry_request = $2, registry_response = $3 WHERE id = $1', [id, JSON.stringify(request), JSON.stringify(response)]);
}

export async function getRegistryTrace(id: string): Promise<{ request: unknown; response: unknown } | null> {
  const { rows } = await pool.query<{ registry_request: unknown; registry_response: unknown }>('SELECT registry_request, registry_response FROM gs1_dpp_records WHERE id = $1', [id]);
  const row = rows[0];
  return row && row.registry_response ? { request: row.registry_request, response: row.registry_response } : null;
}

/** Modifica di UNA scheda nel tempo: `changes` è { chiave: { before, after } } (null = assente). */
export interface DppEvent {
  id: string;
  dppId: string;
  at: string;
  scenario: string;
  simulated: boolean;
  title: string;
  summary: string;
  changes: Record<string, { before: string | null; after: string | null }>;
}

interface EventRow {
  id: string;
  dpp_id: string;
  at: Date;
  scenario: string;
  simulated: boolean;
  title: string;
  summary: string;
  changes: DppEvent['changes'];
}

function eventFromRow(row: EventRow): DppEvent {
  return { id: row.id, dppId: row.dpp_id, at: row.at.toISOString(), scenario: row.scenario, simulated: row.simulated, title: row.title, summary: row.summary, changes: row.changes };
}

export async function listEvents(dppId: string): Promise<DppEvent[]> {
  const { rows } = await pool.query<EventRow>('SELECT * FROM gs1_dpp_events WHERE dpp_id = $1 ORDER BY at ASC, created_at ASC', [dppId]);
  return rows.map(eventFromRow);
}

/** Applica una modifica ad una scheda e ne registra l'evento, in una sola transazione: gli
 * attributi cambiano, `updated_at` diventa l'istante (simulato) della modifica. */
export async function applyChange(
  record: DppRecord,
  attributes: Record<string, Record<string, string>>,
  event: Omit<DppEvent, 'id' | 'dppId'>
): Promise<{ record: DppRecord; event: DppEvent }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query<DppRow>('UPDATE gs1_dpp_records SET attributes = $2, updated_at = $3 WHERE id = $1 RETURNING *', [record.id, JSON.stringify(attributes), event.at]);
    const inserted = await client.query<EventRow>(
      'INSERT INTO gs1_dpp_events (id, dpp_id, at, scenario, simulated, title, summary, changes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [randomUUID(), record.id, event.at, event.scenario, event.simulated, event.title, event.summary, JSON.stringify(event.changes)]
    );
    await client.query('COMMIT');
    return { record: fromRow(updated.rows[0]), event: eventFromRow(inserted.rows[0]) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
