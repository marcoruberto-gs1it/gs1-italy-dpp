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
  /** Coppie chiave/valore libere — i settori non hanno ancora uno schema dati proprio. */
  attributes: Record<string, string>;
  status: DppStatus;
  createdAt: string;
  updatedAt: string;
  registryId: string | null;
  proofJwt: string | null;
  registeredAt: string | null;
  /** EN 18223 §4.1.2.1 (Table 1, "economicOperatorId") — campo OBBLIGATORIO dello schema,
   * prima hardcoded a una costante demo: compilato dall'utente nel form admin come GLN GS1
   * (es. "urn:gs1:gln:8012345000008"), non più un valore fisso. NOT NULL con default demo per
   * compatibilità con le righe create prima di questa colonna. */
  economicOperatorId: string;
  /** EN 18223 §4.1.2.1 (Table 1, "facilityId") — opzionale per lo standard, ma qui NOT NULL con
   * default demo per lo stesso motivo di economicOperatorId sopra E perché mock-eu-registry
   * (vedi mockRegistryClient.ts) richiede sempre facilitiesId nel payload di registrazione:
   * lasciarlo vuoto romperebbe una pubblicazione vera, non solo la conformità EN 18223. */
  facilityId: string;
}

/** Riga così com'è restituita da Postgres (snake_case, timestamp come Date). */
interface DppRow {
  id: string;
  sector_id: string;
  gtin: string;
  name: string;
  granularity_level: string;
  batch_or_serial: string | null;
  attributes: Record<string, string>;
  status: string;
  created_at: Date;
  updated_at: Date;
  registry_id: string | null;
  proof_jwt: string | null;
  registered_at: Date | null;
  economic_operator_id: string;
  facility_id: string;
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
    economic_operator_id TEXT NOT NULL DEFAULT 'gs1-italy-dpp-demo',
    facility_id TEXT NOT NULL DEFAULT 'gs1-italy-dpp-demo-facility'
  )
`);
// Le due colonne sopra sono arrivate dopo la prima CREATE TABLE — su un database già esistente
// (Render/Supabase in produzione, non ricreato da zero) CREATE TABLE IF NOT EXISTS non le
// aggiungerebbe da sola alle righe già presenti. ADD COLUMN IF NOT EXISTS con lo stesso default
// è idempotente: non fa nulla se la colonna c'è già (deploy successivi), la crea con lo stesso
// valore demo di sempre se manca (prima esecuzione dopo questo cambiamento).
await pool.query("ALTER TABLE gs1_dpp_records ADD COLUMN IF NOT EXISTS economic_operator_id TEXT NOT NULL DEFAULT 'gs1-italy-dpp-demo'");
await pool.query("ALTER TABLE gs1_dpp_records ADD COLUMN IF NOT EXISTS facility_id TEXT NOT NULL DEFAULT 'gs1-italy-dpp-demo-facility'");
await pool.query('CREATE INDEX IF NOT EXISTS gs1_dpp_records_gtin_idx ON gs1_dpp_records (gtin)');

function fromRow(row: DppRow): DppRecord {
  return {
    id: row.id,
    sectorId: row.sector_id as SectorId,
    gtin: row.gtin,
    name: row.name,
    granularityLevel: row.granularity_level as GranularityLevel,
    batchOrSerial: row.batch_or_serial,
    attributes: row.attributes,
    status: row.status as DppStatus,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    registryId: row.registry_id,
    proofJwt: row.proof_jwt,
    registeredAt: row.registered_at ? row.registered_at.toISOString() : null,
    economicOperatorId: row.economic_operator_id,
    facilityId: row.facility_id,
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
 * GTIN — usata da routes/v1.ts#POST /dpps (EN 18222 §3.5, CreateDPP) per il 409 Conflict su una
 * ricreazione, verificato contro il comportamento reale di un'implementazione di riferimento
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
  attributes?: Record<string, string>;
  /** EN 18223 §4.1.2.1 Table 1 — obbligatorio per lo schema, facoltativo qui (default demo se
   * omesso) per non rompere i chiamanti esistenti (routes/v1.ts, seed.ts) scritti prima di
   * questa colonna. */
  economicOperatorId?: string;
  facilityId?: string;
}

/** Stessi due valori demo del default NOT NULL della colonna (vedi CREATE TABLE/ADD COLUMN più
 * sopra) — ripetuti qui in JS perché "DEFAULT" come parola chiave SQL può comparire solo come
 * intero elemento di una VALUES list, non dentro un'espressione come COALESCE($n, DEFAULT). */
const FALLBACK_ECONOMIC_OPERATOR_ID = 'gs1-italy-dpp-demo';
const FALLBACK_FACILITY_ID = 'gs1-italy-dpp-demo-facility';

export async function createDpp(input: CreateDppInput): Promise<DppRecord> {
  const id = randomUUID();
  const { rows } = await pool.query<DppRow>(
    `INSERT INTO gs1_dpp_records (id, sector_id, gtin, name, granularity_level, batch_or_serial, attributes, economic_operator_id, facility_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
    ]
  );
  return fromRow(rows[0]);
}

export type UpdateDppInput = Partial<CreateDppInput>;

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
