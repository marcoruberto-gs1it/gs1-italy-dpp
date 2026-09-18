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
    registered_at TIMESTAMPTZ
  )
`);
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

export interface CreateDppInput {
  sectorId: SectorId;
  gtin: string;
  name: string;
  granularityLevel: GranularityLevel;
  batchOrSerial?: string | null;
  attributes?: Record<string, string>;
}

export async function createDpp(input: CreateDppInput): Promise<DppRecord> {
  const id = randomUUID();
  const { rows } = await pool.query<DppRow>(
    `INSERT INTO gs1_dpp_records (id, sector_id, gtin, name, granularity_level, batch_or_serial, attributes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [id, input.sectorId, input.gtin, input.name, input.granularityLevel, input.batchOrSerial ?? null, JSON.stringify(input.attributes ?? {})]
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
  };
  const { rows } = await pool.query<DppRow>(
    `UPDATE gs1_dpp_records SET
      sector_id = $2, gtin = $3, name = $4, granularity_level = $5,
      batch_or_serial = $6, attributes = $7, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, merged.sectorId, merged.gtin, merged.name, merged.granularityLevel, merged.batchOrSerial, JSON.stringify(merged.attributes)]
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
